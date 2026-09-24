import type { HeadersInit } from "bun";
import { Constants } from "./Constants";
import { DatabaseConnection, Tables, type Country, type Verb, type Word } from "./DatabaseConnection";
import { SessionManager } from "./SessionManager"
import { UserManager } from "./UserManager";
import { SignJWT } from "jose";
import { existsSync } from "fs";
import { join } from "path";

const JWT_SECRET = new TextEncoder().encode(Bun.env.JWT_SECRET!);

const ALLOWED_ORIGIN = "http://localhost:5173";

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

function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
}

const USER_ROUTE_PATTERN = new URLPattern({ pathname: "/user/:id" });

Bun.serve({
    port : Constants.PORT,
    async fetch(req, server) {
        const url = new URL(req.url);

        debugLog(url.pathname);

        if (req.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders() });
        }

        if(url.pathname == "/version")
        {
            return version();
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
                    return Response.json({message : login_result.error}, { status : 401, headers : corsHeaders() })
                }

                const cookie_token = await new SignJWT({ token : login_result.token, uuid : login_result.uuid })
                    .setProtectedHeader({ alg: 'HS256' })
                    .setIssuedAt()
                    .setExpirationTime('2h')
                    .sign(JWT_SECRET);

                    const cookie = [
                        `auth_token=${cookie_token}`,
                        "HttpOnly",
                        "Secure",
                        "SameSite=None",
                        `Max-Age=${2 * 60 * 60}`,
                        "Path=/",
                    ].join("; ");

                    const headers = new Headers(corsHeaders());
                    headers.set("Content-Type", "application/json");
                    headers.set("Set-Cookie", cookie);


                return Response.json(login_result, { status : 200, headers: headers });
            }
            catch(e : any)
            {
                return Response.json({ error : e.message }, { status : 400, headers: corsHeaders() });
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
                return Response.json(register_result);
            }
            catch(e : any)
            {
                return Response.json({ error : e.message }, { status : 400, headers: corsHeaders() });
            }
        }

        if(url.pathname == "/me" && req.method == "GET")
        {
            let body : any = await req.body?.json();
            return check_user_token(req, body, async (req : Request, body : any, user_id : string) => 
            {
                const user_result = await UserManager.getUserInfo(user_id);
                return Response.json({result : user_result}, { status: 200, headers: corsHeaders() });
            });
        }

        if(url.pathname == "/words")
        {
            const words = await DatabaseConnection.getTable<Word>(Tables.WORDS);
            debugLog("words : ", words);
            return Response.json({ "words" : words }, { status: 200, headers: corsHeaders() });
        }

        if(url.pathname == "/verbs")
        {
            const words = await DatabaseConnection.getTable<Verb>(Tables.VERBS);
            return Response.json({ "verbs" : words }, { status: 200, headers: corsHeaders() });
        }

        if(url.pathname == "/countries")
        {
            const words = await DatabaseConnection.getTable<Country>(Tables.COUNTRY);
            return Response.json({ "countries" : words }, { status: 200, headers: corsHeaders() });
        }

        if(url.pathname == "/grammar")
        {
            const words = await DatabaseConnection.getTable<Word>(Tables.GRAMMAR);
            return Response.json({ "grammar" : words }, { status: 200, headers: corsHeaders() });
        }

        const user_match = USER_ROUTE_PATTERN.exec(url);

        if(user_match && req.method === "GET")
        { 
            const userId = user_match.pathname.groups.id as string;
            const result = await DatabaseConnection.getUserInfo(userId);
            if(result)
                return Response.json(result, { status: 200, headers: corsHeaders() });
            return Response.json(result, { status: 400, headers: corsHeaders() });
        }

        if(url.pathname == "/ws")
        {
            if(server.upgrade(req))
            {
                return;
            }
            return new Response("Upgrade Failed", { status: 500, headers: corsHeaders() });
        }

        //return Response.redirect("/version");
        return new Response("Invalid request !", { status : 404, headers: corsHeaders() });
    },
    websocket : {
        open(ws)
        {
            console.log("Client connection")
        },
        message(ws, data) 
        {
            console.log("Message ", data);
        },
        close(ws)
        {
            console.log("Client disconnected ;(");
        }
    },
})

async function check_user_token(req : Request, body : any, callback : (req : Request, body : any, user_id : string) => Promise<Response>): Promise<Response> {
    const authHeaders = req.headers.get("Authorization");
    const token = authHeaders?.replace("Bearer ", "");

    if (!token) return Response.json({ error: "Unauthentificated" }, { status: 401, headers: corsHeaders() });

  const user_id = SessionManager.verify_session(token);
  if (!user_id) return Response.json({ error: "Invalid or expired session" }, { status: 401, headers: corsHeaders() });

  return callback(req, body, user_id);
}

function version() : Response {
   return Response.json({ version : Constants.GAME_VERSION }, { status: 200, headers: corsHeaders() })
}

SessionManager.init();
DatabaseConnection.init();

console.log("Server running on port ", Constants.PORT);
debugLog("JWT_SECRET chargé :", Bun.env.JWT_SECRET ? "oui" : "MANQUANT");