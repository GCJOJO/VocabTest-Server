import * as Utils from "./Utils.js";
import * as DatabaseConnection from "./DatabaseConnection.js";

var lobbies = [];

export function createLobby(playerId, ownerWebsocket) {
	let lobbyId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

	let organisedWords = DatabaseConnection.getWords();
	let words = Utils.shuffle(organisedWords);
	lobbies[lobbyId] = {
		owner: playerId,
		players: [],
		words: words,
		current_word_index: 0,
		players_submitted_word: 0,
		status: "waiting",
	};

	joinLobby(lobbyId, playerId, ownerWebsocket);

	return lobbyId;
}

export function joinLobby(lobbyId, playerId, playerWebsocket) 
{
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		if (lobby.players.filter((player) => player.id == playerId).length != 0) {
			console.warn("Player has already joined !");
			return false;
		}

        let currentLobbyPlayers = lobbies[lobbyId].players.map((player) => {
            return { player_id: player.id, score: player.score };
        });

        let response = { action: "lobby-joined", lobby_id: lobbyId, current_lobby_players: currentLobbyPlayers };
        playerWebsocket.send(JSON.stringify(response));

		let playerJoined = { action: "player-joined", player_id: playerId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(playerJoined)));

		lobby.players.push({
			id: playerId,
			entered_word: "",
			ready_for_next_word: false,
			score: 0,
			websocket: playerWebsocket,
		});
		return true;
	}

	return false;
}

export function leaveLobby(lobbyId, playerId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
        let leavingPlayer = lobby.players.filter((player) => player.id == playerId);

		lobby.players = lobby.players.filter((player) => player.id != playerId);
		lobby.players.forEach((player) => {
			let playerLeft = { action: "player-left", player_id: playerId };
			player.websocket.send(JSON.stringify(playerLeft));
		});

        let response = { action: "lobby-left", lobby_id: lobbyId };
        leavingPlayer.websocket.send(JSON.stringify(response));

        if (lobbies[lobbyId].players.length == 0) disbandLobby(lobbyId);

		return true;
	}
	return false;
}

export function disbandLobby(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		let response = { action: "lobby-disbanded", lobby_id: lobbyId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(response)));

		delete lobbies[lobbyId];
	}
}

export function startLobby(lobbyId, playerId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined && lobby.owner == playerId) {
		lobby.status = "started";
		let response = { action: "lobby-started", lobby_id: lobbyId };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(response)));

		lobby.current_word_index = 0;
		let current_word = lobby.words[lobby.current_word_index];
		sendWord(lobbyId, current_word);
	}
}

export function sendWord(lobbyId, word) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let newWord = { action: "new-word", word: word };
	lobby.players.forEach((player) => player.websocket.send(JSON.stringify(newWord)));
}

export function nextWord(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	lobby.players.forEach((player) => (player.ready_for_next_word = false));

	//choose new word
	lobby.current_word_index += 1;

	if (lobby.current_word_index >= lobby.words.length) {
		lobby.status = "ended";
		let endGame = { action: "end-game" };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(endGame)));
		return;
	}

	let current_word = lobby.words[lobby.current_word_index];
	sendWord(lobbyId, current_word);
}

export function receiveWord(lobbyId, playerId, word) 
{
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let player = lobby.players.find(p => p.id === playerId);
	if (player == undefined) return;

	let response = { action: "word-received", word: word };
	player.websocket.send(JSON.stringify(response));

	player.entered_word = word;
	lobby.players_submitted_word += 1;

	if(lobby.players_submitted_word >= lobby.players.length) 
	{
		updateScores(lobbyId);
	}

	//checkPlayerEnterWords(lobbyId);
}

export function updateScores(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;
	
	let updatedScores = [];
	lobby.players.forEach((player) => {
		let valid = checkWord(player.entered_word, lobby.words[lobby.current_word_index].anglais);
		player.entered_word = "";
		player.score += valid ? 1 : 0;
		updatedScores.push({
			player_id: player.id,
			new_score: player.score,
		});

		let showResults = { action: "show-results", valid: valid };
		player.websocket.send(JSON.stringify(showResults));
	});
	lobby.players_submitted_word = 0;

	let updateScores = {
		action: "update-scores",
		scores: updatedScores,
	};
	lobby.players.forEach((player) => player.websocket.send(JSON.stringify(updateScores)));
	
}

export function playerRequestedNextWord(lobbyId, playerId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let player = lobby.players.find(player => player.id === playerId)
	if(player == undefined) return;

	player.ready_for_next_word = true;

	let allReady = true;
	lobby.players.forEach((player) => {
		if (!player.ready_for_next_word) allReady = false;
	});

	if (allReady){ 
		updateScores(lobbyId);
		nextWord(lobbyId)
	};
}

export function checkWord(playerWord, correctWordList) {
	let englishWords = correctWordList.split("/");
	let valid = false;
	englishWords.forEach((correctWord) => {
		if (playerWord.toLowerCase().includes(correctWord.toLowerCase())) {
			valid = true;
			return;
		}
	});

	return valid; // Better check, maybe distance
}

export function getLobbies() 
{
    var lobbiesJson = [];
	Object.keys(lobbies).forEach(function (lobbyId) {
		var lobbyJson = {};
		var lobby = lobbies[lobbyId];
		lobbyJson["id"] = lobbyId;
		lobbyJson["owner"] = lobby.owner;
		lobbyJson["player_count"] = lobby.players.length;
		lobbyJson["words"] = lobby.words;
		lobbyJson["current_word_index"] = lobby.current_word_index;
        lobbyJson["players_submitted_word"] = lobby.players_submitted_word;
		lobbyJson["status"] = lobby.status;
		lobbiesJson.push(lobbyJson);
	});

    return lobbiesJson;
}

export function testOwnership(lobbyId, playerId) 
{
	var lobby = lobbies[lobbyId];
	if (lobby == undefined) {
		return false;
	}
    return lobby.owner == playerId;
}