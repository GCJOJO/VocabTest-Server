import * as DatabaseConnection from "./DatabaseConnection";
import { Lobby } from "./Lobby";
import { MapUtils } from "./Utils/MapUtils";

Bun.cron("* * * * * *", () => GameManager.tickLobbies());

// Cleanup lobbies every 30 seconds
Bun.cron("*/30 * * * * *", () => GameManager.cleanupLobbies());

export class GameManager 
{
	private static lobbies : Map<string, Lobby> = new Map();

	public static createLobby(playerId : string, ownerWebsocket : WebSocket) {
		let lobbyId : string = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
		this.lobbies.set(lobbyId, new Lobby(lobbyId, playerId));
		return lobbyId;
	}

	public static joinLobby(lobbyId : string, playerId : string, playerWebsocket : WebSocket) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby != undefined) {
			return lobby.PlayerJoin(playerId, playerWebsocket);
		}

		return false;
	}

	public static leaveLobby(lobbyId : string, playerId : string) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby != undefined) {
			if(lobby.PlayerLeave(playerId))
				if (lobby.GetPlayerAmount() == 0) 
					this.disbandLobby(lobbyId);
			return true;
		}
		return false;
	}

	public static updateLobbyOptions(lobbyId : string, playerId : string, options : any) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby != undefined && lobby.owner_id == playerId) {
			lobby.options.FromJson(options);
			lobby.players.forEach((player) => player.websocket.send(JSON.stringify({ action: "lobby-options-updated", options: lobby.options.ToJson() })));
		}
	}

	public static getLobbyOptions(lobbyId : string) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby != undefined) {
			return lobby.options.ToJson();
		}
		return null;
	}

	public static disbandLobby(lobbyId : string) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby != undefined) {
			let response = { action: "lobby-disbanded", lobby_id: lobbyId };
			lobby.players.forEach((player) => player.websocket.send(JSON.stringify(response)));

			this.lobbies.delete(lobbyId);
		}
	}

	public static startLobby(lobbyId : string, playerId : string) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby != undefined && lobby.owner_id == playerId) {
			lobby.StartLobby();
		}
	}

	public static setIsSpectator(lobbyId: string, playerId: string, isSpectator: boolean) 
	{
		let lobby = this.lobbies.get(lobbyId);
		if (lobby == undefined) return;

		let player = lobby.players.get(playerId);
		if (player == undefined) return;

		player.is_spectator = isSpectator;
		player.is_spectating = isSpectator;

		let response = { action: "spectator-status-updated", player_id: playerId, is_spectator: isSpectator };
		lobby.players.forEach((p) => p.websocket.send(JSON.stringify(response)));
	}

	public static nextQuestion(lobbyId : string) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby == undefined) return;

		lobby.NextQuestion();
	}

	public static receiveAnswer(lobbyId : string, playerId : string, answer : string, answerType : number) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby == undefined) return;

		lobby.ReceiveAnswer(playerId, answer, answerType);
	}

	public static updateScores(lobbyId : string) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby == undefined) return;

		lobby.UpdateScores();
	}

	public static playerRequestedNextQuestion(lobbyId : string, playerId : string) {
		let lobby = this.lobbies.get(lobbyId);
		if (lobby == undefined) return;

		lobby.PlayerReadyForNextQuestion(playerId);
	}

	public static continueGame(lobbyId : string)
	{
		let lobby = this.lobbies.get(lobbyId);
		if (lobby == undefined) return;
		
		lobby.ContinueLobby();
	}

	public static getLobbies() {
		var lobbiesJson : 
		{ 
			id: string, 
			owner: string, 
			player_count: number, 
			options: any, 
			status: string, 
			lobby_mode: string 
		}[] = [];

		this.lobbies.forEach((lobby, lobbyId) => {
			if(lobby == undefined) return;

			lobbiesJson.push({
				id: lobby.id,
				owner: lobby.owner_id,
				player_count: lobby.players.size,
				options: lobby.options.ToJson(),
				status: lobby.state.toString(),
				lobby_mode: lobby.options.lobby_mode.toString()
			});
		});

		return lobbiesJson;
	}

    public static testOwnership(lobbyId : string, playerId : string) : boolean {
		var lobby = this.lobbies.get(lobbyId);
		if (lobby == undefined) {
			return false;
		}
		return lobby.owner_id == playerId;
	}

	public static cleanupLobbies()
	{
		var lobbiesBeforeCleanup = Object.keys(this.lobbies).length;
		this.lobbies.forEach((lobby, lobbyId) => {
			if(lobby == undefined) return;
			lobby.players.forEach((player) => {
				if (player.websocket.readyState != 1)
					GameManager.leaveLobby(lobbyId, player.id);
			});
		});
		let lobbiesCleaned = lobbiesBeforeCleanup - Object.keys(this.lobbies).length;
		if (lobbiesCleaned > 0)
			console.log("Cleaned up " + lobbiesCleaned + " lobbies.");
	}

	public static tickLobbies()
	{
		this.lobbies.forEach((lobby, lobbyId) => {
			if(lobby == undefined) return;
			lobby.TickLobby();
		});		
	}
}