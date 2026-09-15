import { Constants } from "./Constants";
import { DatabaseConnection, Tables, type Country, type Verb, type Word } from "./DatabaseConnection";
import { SessionManager } from "./SessionManager"
import { UserManager } from "./UserManager";

Bun.serve({
    port : Constants.PORT,
    async fetch(req, server) {
        const url = new URL(req.url);

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
                return Response.json(login_result);
            }
            catch(e : any)
            {
                return Response.json({ error : e.message }, { status : 400 });
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
                return Response.json({ error : e.message }, { status : 400 });
            }
        }

        if(url.pathname == "/me" && req.method == "GET")
        {
            let body : any = await req.body?.json();
            return check_user_token(req, body, async (req : Request, body : any, user_id : string) => 
            {
                const user_result = await UserManager.getUserInfo(user_id);
                return Response.json({result : user_result});
            });
        }

        if(url.pathname == "/words")
        {
            const words = await DatabaseConnection.GetTable<Word>(Tables.WORDS);
            return Response.json({ "words" : words });
        }

        if(url.pathname == "/verbs")
        {
            const words = await DatabaseConnection.GetTable<Verb>(Tables.VERBS);
            return Response.json({ "verbs" : words });
        }

        if(url.pathname == "/countries")
        {
            const words = await DatabaseConnection.GetTable<Country>(Tables.COUNTRY);
            return Response.json({ "countries" : words });
        }

        if(url.pathname == "/grammar")
        {
            const words = await DatabaseConnection.GetTable<Word>(Tables.GRAMMAR);
            return Response.json({ "grammar" : words });
        }

        if(url.pathname == "/ws")
        {
            if(server.upgrade(req))
            {
                return;
            }
            return new Response("Upgrade Failed", { status: 500 });
        }

        //return Response.redirect("/version");
        return new Response("Invalid request !", { status : 404 });
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

    if (!token) return Response.json({ error: "Unauthentificated" }, { status: 401 });

  const user_id = SessionManager.verify_session(token);
  if (!user_id) return Response.json({ error: "Invalid or expired session" }, { status: 401 });

  return callback(req, body, user_id);
}

function version() : Response {
   return Response.json({ version : Constants.GAME_VERSION })
}

SessionManager.init();

console.log("Server running on port ", Constants.PORT);