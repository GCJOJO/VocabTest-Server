export class LobbyPlayer
{
    public id: string;
    public entered_answer: string = "";
    public score: number = 0;
    public is_ready_for_next_question : boolean = false;
    public is_spectator: boolean = false;
    public is_spectating: boolean = false;

    public websocket: WebSocket;

    constructor(id: string, websocket: WebSocket)
    {
        this.id = id;
        this.websocket = websocket;
    }
}