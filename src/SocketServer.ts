import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { GameManager } from "./GameManager.js";
import { Constants } from "./Constants.js";

export class SocketServer
{
    private wss : WebSocketServer;

    constructor(server : any, messageCallback : (ws : WebSocket, msg : any) => void)
    {
        this.wss = new WebSocketServer({ server: server });

        this.wss.on("connection", (ws : WebSocket) => {
            //console.log("New WebSocket connection");

            ws.on("message", (msg : any, isBinary : boolean) => 
            {
                try 
                {
                    var msgAsString : String = msg.toString('utf-8');

                    //console.log("Received WebSocket message:", msgAsString);
                    if (typeof msgAsString === "string") 
                        messageCallback(ws, msgAsString);
                    /*else 
                        console.warn("Received non-string message, ignoring.");*/
                } 
                catch (error) 
                {
                    console.error("Error parsing WebSocket message:", error);
                }
            });
        });
    }
}