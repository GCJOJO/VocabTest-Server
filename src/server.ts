import type { HeadersInit } from "bun";
import { Constants } from "./Constants";
import { DatabaseConnection, Tables, type Country, type Verb, type Word } from "./DatabaseConnection";
import { SessionManager } from "./SessionManager"
import { UserManager } from "./UserManager";
import { SignJWT, jwtVerify } from "jose";
import { existsSync } from "fs";
import { join } from "path";
import { GameManager } from "./GameManager";
import type { RowDataPacket } from "mysql2";

const jwtSecret = Bun.env.JWT_SECRET;
 if (!jwtSecret) throw new Error("JWT_SECRET is required in file .env");
 const JWT_SECRET = new TextEncoder().encode(jwtSecret);

const ALLOWED_ORIGINS = (Bun.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map(o => o.trim());

const DEBUG_FILE_PATH = join(process.cwd(), ".debug");

function isDebugMode() : boolean {
     if (Bun.env.DEBUG === "true" || Bun.env.DEBUG === "1") {
        return true;
    }

    return existsSync(DEBUG_FILE_PATH);
}

function debugLog(...args : unknown[]): void{
    if(isDebugMode())
        console.log(...args);
}

function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get("origin") ?? "";
    const headers: Record<string, string> = {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Vary": "Origin",
    };
    if (ALLOWED_ORIGINS.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
    }
    return headers;
}

function cookieAttributes(maxAge: number): string[] {
    return [
        "HttpOnly",
        "Path=/",
        `Max-Age=${maxAge}`,
        ...(isDebugMode() ? ["SameSite=Lax"] : ["Secure", "SameSite=None"]),
    ];
}

const USER_ROUTE_PATTERN = new URLPattern({ pathname: "/user/:id" });
const OWNER_ROUTE_PATTERN = new URLPattern({ pathname: "/owner/:id" });


function parseCookies(req: Request): Record<string, string> {
    const header = req.headers.get("cookie");
    if (!header) return {};

    return Object.fromEntries(
        header.split(";").map(c => {
            const [key, ...v] = c.trim().split("=");
            return [key, decodeURIComponent(v.join("="))];
        })
    );
}

async function getAuthPayload(req: Request): Promise<{ token: string; uuid: string } | null> {
    const token = parseCookies(req)["auth_token"];
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload as { token: string; uuid: string };
    } catch {
        return null; // signature invalide ou token expiré
    }
}

const vocabLists = [
    { name: "words",   table: Tables.WORDS },
    { name: "grammar", table: Tables.GRAMMAR },
    { name: "gaming",  table: Tables.GAMING },
    { name: "verbs",   table: Tables.VERBS },
    { name: "countries", table: Tables.COUNTRY },
];

type VocabList = (typeof vocabLists)[number];

Bun.serve({
    port : Constants.PORT,
    async fetch(req, server) {
        const url = new URL(req.url);

        debugLog(url.pathname);

        let headers = new Headers(corsHeaders(req));

        if (req.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: headers });
        }

        if(url.pathname == "/version")
        {
            return version(headers);
        }

        if(url.pathname == "/login" && req.method == "POST")
        {
            try
            {
                const body : { username : string, password : string } = await req.json() as any;
                const username = body.username;
                const password = body.password;
                
                const login_result = await UserManager.login(username, password);
                if(!login_result.success)
                {
                    return Response.json({message : login_result.error}, { status : 401, headers : headers });
                }

                const cookie_token = await new SignJWT({ token : login_result.token, uuid : login_result.uuid })
                    .setProtectedHeader({ alg: 'HS256' })
                    .setIssuedAt()
                    .setExpirationTime('2h')
                    .sign(JWT_SECRET);

                const cookie = [`auth_token=${cookie_token}`, ...cookieAttributes(2 * 60 * 60)].join("; ");

                headers.set("Content-Type", "application/json");
                headers.set("Set-Cookie", cookie);


                return Response.json({uuid : login_result.uuid}, { status : 200, headers: headers });
            }
            catch(e : any)
            {
                return Response.json({ error : e.message }, { status : 400, headers: headers });
            }
        }

        if(url.pathname == "/register" && req.method == "POST")
        {
            try {
                const body : { username : string, password : string, first_name : string, last_name : string } = await req.json() as any;
                const username = body.username;
                const password = body.password;
                const first_name = body.first_name;
                const last_name = body.last_name;

                
                const register_result = await UserManager.createUser(username, first_name, last_name, password);

                const cookie_token = await new SignJWT({ token : register_result.token, uuid : register_result.uuid })
                    .setProtectedHeader({ alg: 'HS256' })
                    .setIssuedAt()
                    .setExpirationTime('2h')
                    .sign(JWT_SECRET);

                const cookie = [`auth_token=${cookie_token}`, ...cookieAttributes(2 * 60 * 60)].join("; ");

                headers.set("Content-Type", "application/json");
                headers.set("Set-Cookie", cookie);

                return Response.json(register_result, { status : register_result.success ? 200 : 400, headers: headers });
            }
            catch(e : any)
            {
                return Response.json({ error : e.message }, { status : 400, headers: headers });
            }
        }

        if(url.pathname == "/logout" && req.method == "POST")
        {
            return await check_user_token(req, req.body, async (req : Request, body : any, user_id : string, token : string) => {
                SessionManager.destroy_session(token);
                
                const cookie = [
                    "auth_token=",
                    "HttpOnly",
                    "Secure",
                    "SameSite=None",
                    "Max-Age=0",
                    "Path=/",
                ].join(';');

                headers.set("Content-Type", "application/json");
                headers.set("Set-Cookie", cookie);

                return Response.json({message : "Logged Out !"}, {status : 200, headers : headers});
            });


            
        }

        if(url.pathname == "/me" && req.method == "GET")
        {            
            let body : any = {};
            return check_user_token(req, body, async (req : Request, body : any, user_id : string, token : string) => 
            {
                const user_result = await UserManager.getUserInfo(user_id);
                debugLog("/me : user result : ", user_result);
                return Response.json({result : user_result}, { status: 200, headers: headers });
            });
        }

        // if(url.pathname == "/words" && req.method == "GET")
        // {
        //     const words = await DatabaseConnection.getTable<Word>(Tables.WORDS);
        //     debugLog("words : ", words);
        //     return Response.json({ "words" : words }, { status: 200, headers: headers });
        // }

        for (const list of vocabLists) {
            const get_response = await handleVocabList(list.name, list.table, url, req.method, headers);
            if (get_response) return get_response; 

            const edit_response = await handleVocabEdit(list, url, req, headers);
            if(edit_response) return edit_response;
        }  

               
        

        if(url.pathname == "/lobbies")
        {
            return Response.json({lobbies : GameManager.getLobbies()}, {status: 200, headers : headers});
        }

        const user_match = USER_ROUTE_PATTERN.exec(url);
        if(user_match && req.method === "GET")
        { 
            const userId = user_match.pathname.groups.id as string;
            const result = await DatabaseConnection.getUserInfo(userId);
            debugLog("User Id : ", userId, " result :", result);
            if(result.success)
                return Response.json({user_info: result.user_info}, { status: 200, headers: headers });
            return Response.json(result, { status: 400, headers: headers });
        }

        const owner_match = OWNER_ROUTE_PATTERN.exec(url);
        if(owner_match && req.method === "GET")
        {
            const lobbyId = owner_match.pathname.groups.id as string;
            const playerId = url.searchParams.get("player_id");
            if(!playerId)
                return Response.json({message : "Invalid Player Id"}, { status: 400, headers: headers });
            return Response.json({ result: GameManager.testOwnership(lobbyId, playerId)}, {status : 200, headers: headers});
        }

        if(url.pathname == "/ws")
        {
            if(server.upgrade(req))
            {
                return;
            }
            return new Response("Upgrade Failed", { status: 500, headers: headers });
        }

        //return Response.redirect("/version");
        return new Response("Invalid request !", { status : 404, headers: headers });
    },
    websocket : {
        open(ws)
        {
            console.log("Client connection");
        },
        message(ws, data) 
        {
            console.log("Message ", data);
            try {
                var json = JSON.parse(data.toString());
            } catch (error) {
                console.error("Unable to cast ", data.toString(), " to a valid JSON object")
                return;
            }

            try {
                var playerId = json.player_id;
                var action = json.action;
                var lobbyId = json.lobby_id;

                switch (action) {
                    case "create-lobby": {
                        let response = {
                            action: "lobby-created",
                            lobby_id: GameManager.createLobby(playerId, ws),
                        };
                        ws.send(JSON.stringify(response));
                        break;
                    }
                    case "join-lobby": {
                        GameManager.joinLobby(lobbyId, playerId, ws);
                        break;
                    }

                    case "leave-lobby": {
                        GameManager.leaveLobby(lobbyId, playerId);
                        break;
                    }

                    case "update-lobby-options": {
                        GameManager.updateLobbyOptions(lobbyId, playerId, json.options);
                        break;
                    }

                    case "set-is-spectator": {
                        GameManager.setIsSpectator(lobbyId, playerId, json.is_spectator);
                        break;
                    }

                    case "start-lobby": {
                        GameManager.startLobby(lobbyId, playerId);
                        break;
                    }

                    case "send-answer":
                    {
                        //console.log("Received answer from player " + playerId + " in lobby " + lobbyId + ": " + json.answer, " (" + json.answer_type + ")");	
                        GameManager.receiveAnswer(lobbyId, playerId, json.answer, json.answer_type);
                        break;
                    }

                    case "request-next-question": {
                        GameManager.playerRequestedNextQuestion(lobbyId, playerId);
                        break;
                    }

                    case "continue-game":
                    {
                        GameManager.continueGame(lobbyId);	
                        break;
                    }

                    case "update-is-spectator": {
                        //console.log("Player " + playerId + " in lobby " + lobbyId + " is now " + (json.is_spectator ? "a spectator" : "a player"));
                        GameManager.setIsSpectator(lobbyId, playerId, json.is_spectator);
                        break;
                    }
                }
            }
            catch(error)
            {
                console.error("Error while handling Websocket message : ", json)
            }
        },
        close(ws)
        {
            console.log("Client disconnected ;(");
        }
    },
})

async function check_user_token(req : Request, body : any, callback : (req : Request, body : any, user_id : string, token: string) => Promise<Response>): Promise<Response> {
    const auth = await getAuthPayload(req);

    let headers = new Headers(corsHeaders(req));

    if (!auth || !auth.token) return Response.json({ error: "Unauthentificated" }, { status: 401, headers: headers });

  const user_id = SessionManager.verify_session(auth.token);
  if (!user_id) return Response.json({ error: "Invalid or expired session" }, { status: 401, headers: headers });

  return callback(req, body, user_id, auth.token);
}

function version(headers: Headers) : Response {
   return Response.json({ version : Constants.GAME_VERSION }, { status: 200, headers: headers })
}

SessionManager.init();
DatabaseConnection.init();

console.log("Server running on port ", Constants.PORT);
debugLog("JWT_SECRET chargé :", Bun.env.JWT_SECRET ? "oui" : "MANQUANT");


async function handleVocabList<T extends RowDataPacket>(listName : string, tableName : string, requestUrl : URL, requestMethod : string, headers : Headers) : Promise<Response | null>
{
    if(requestUrl.pathname !== "/" + listName || requestMethod !== "GET")
        return null;

    const list = await DatabaseConnection.getTable<T>(tableName);
    return Response.json({ [listName] : list }, { status: 200, headers: headers });
}

async function handleVocabEdit(list: VocabList, url: URL, req: Request, headers : Headers) : Promise<Response | null>
{
    const match = url.pathname.match(new RegExp(`^/${list.name}(?:/(\\d+))?$`));
    if (!match) return null;

   
    const auth_payload = await getAuthPayload(req)
    if (!auth_payload || !auth_payload.token || !SessionManager.verify_session(auth_payload.token)) {
        return Response.json({ message: "Unauthentificated" }, { status: 401, headers: headers });
    }

    if(!UserManager.is_user_admin(auth_payload.uuid)) {
        return Response.json({ message: "Unauthorized" }, { status: 403, headers: headers });
    }

    const id = match[1] ? Number(match[1]) : null;

    try {
        if (id === null && req.method === "POST") {
            const body = (await req.json()) as Record<string, unknown>;
            const insertId = await DatabaseConnection.insertRow(list.table, body);
            return Response.json({ id: insertId }, { status: 201, headers: headers });
        }

        if (id !== null && req.method === "PUT") {
            const body = (await req.json()) as Record<string, unknown>;
            let updateResult = await DatabaseConnection.updateRow(list.table, id, body);
            return Response.json({ success: updateResult }, { status: updateResult ? 200 : 400, headers: headers });
        }

        if (id !== null && req.method === "DELETE") {
            let deleteResult = await DatabaseConnection.deleteRow(list.table, id);
            return Response.json({ success: deleteResult }, { status: deleteResult ? 200 : 400, headers: headers });
        }

        return Response.json({ message: "Unauthorized Method" }, { status: 405, headers: headers });
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 400, headers: headers });
    }
}