import * as Utils from "./Utils.js";
import * as UserManager from "./UserManager.js";
import * as DatabaseConnection from "./DatabaseConnection.js";
import cron from "node-cron";

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
		current_round_timer: -1,
		status: "waiting",
		options:
		{
			"max_words": 10,				// -1 means ALL OF THEM
			"categories": 16,				//  1000 : pays, 0100 : adverbes, 0010 : verbes, 0001 : vocabulaire
			"round_timer": 30, 				// timer in seconds, -1 : no timer
			"similarity_threshold": 0.8		// 0 to 1, how similar the words must be to be considered correct (not implemented yet)
		},
	};

	joinLobby(lobbyId, playerId, ownerWebsocket);

	return lobbyId;
}

export function joinLobby(lobbyId, playerId, playerWebsocket) {
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

		let lobbyOptions = { action: "lobby-options-updated", options: lobby.options };
		playerWebsocket.send(JSON.stringify(lobbyOptions));

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
		let leavingPlayer = lobby.players.find((player) => player.id == playerId);
		let response = { action: "lobby-left", lobby_id: lobbyId };
		leavingPlayer.websocket.send(JSON.stringify(response));

		lobby.players = lobby.players.filter((player) => player.id != playerId);

		lobby.players.forEach((player) => {
			let playerLeft = { action: "player-left", player_id: playerId };
			player.websocket.send(JSON.stringify(playerLeft));
		});


		if (lobbies[lobbyId].players.length == 0) disbandLobby(lobbyId);
		else if (lobby.owner == playerId) {
			lobby.owner = lobby.players[0].id;
			let newOwner = { action: "new-owner", player_id: lobby.owner };
			lobby.players.forEach((player) => player.websocket.send(JSON.stringify(newOwner)));
		}

		return true;
	}
	return false;
}

export function updateLobbyOptions(lobbyId, playerId, options) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined && lobby.owner == playerId) {
		lobby.options = options;
		//console.log("Lobby " + lobbyId + " options updated : " + JSON.stringify(options));
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify({ action: "lobby-options-updated", options: options })));
	}
}

export function getLobbyOptions(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby != undefined) {
		return lobby.options;
	}
	return null;
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

	lobby.status = "started";

	lobby.players.forEach((player) => (player.ready_for_next_word = false));

	//choose new word
	lobby.current_word_index += 1;

	if (lobby.current_word_index >= lobby.words.length) {
		lobby.status = "ended";
		let endGame = { action: "end-game" };
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify(endGame)));
		return;
	}

	if(lobby.options.round_timer != -1)
	{
		lobby.current_round_timer = 0;
		lobby.players.forEach((player) => player.websocket.send(JSON.stringify({ action: "timer-update", current_round_timer: lobby.current_round_timer })));
	}

	let current_word = lobby.words[lobby.current_word_index];
	sendWord(lobbyId, current_word);
}

export function receiveWord(lobbyId, playerId, word) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	if (lobby.status != "started") return;

	let player = lobby.players.find(p => p.id === playerId);
	if (player == undefined) return;

	let response = { action: "word-received", word: word };
	player.websocket.send(JSON.stringify(response));

	player.entered_word = word;
	lobby.players_submitted_word += 1;

	if (lobby.players_submitted_word >= lobby.players.length) {
		updateScores(lobbyId);
	}

	//checkPlayerEnterWords(lobbyId);
}

export function updateScores(lobbyId) {
	let lobby = lobbies[lobbyId];
	if (lobby == undefined) return;

	let updatedScores = [];
	lobby.players.forEach((player) => {
		let wordSimilarity = checkWord(player.entered_word, lobby.words[lobby.current_word_index].anglais, lobby.options.similarity_threshold);
		player.entered_word = "";
		player.score += wordSimilarity;
		updatedScores.push({
			player_id: player.id,
			new_score: player.score,
		});
		lobby.status = "waiting-for-next-word";
		let showResults = { action: "show-results", word_similarity: wordSimilarity, similarity_threshold: lobby.options.similarity_threshold };
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

	if (lobby.status != "waiting-for-next-word") return;

	let player = lobby.players.find(player => player.id === playerId)
	if (player == undefined) return;

	player.ready_for_next_word = true;

	let allReady = true;
	lobby.players.forEach((player) => {
		if (!player.ready_for_next_word) allReady = false;
	});

	if (allReady) {
		if (lobby.current_word_index >= lobby.options.max_words - 1)
		{
			let endGame = { action: "end-game" };
			lobby.players.forEach((player) => player.websocket.send(JSON.stringify(endGame)));
			return;
		}
		nextWord(lobbyId);
	};
}

export function checkWord(playerWord, correctWordList, lobbyThreshold = 0.80) {
	let englishWords = correctWordList.split("/");
	let valid = false;
	let minDistance = 1;
	englishWords.forEach((correctWord) => {
		minDistance = Math.min(levenshteinDistance(playerWord, correctWord), minDistance);
	});

	return (1 - minDistance) >= lobbyThreshold ? 1 - minDistance : 0; // Better check, maybe distance
}

export function getLobbies() {
	var lobbiesJson = [];
	Object.keys(lobbies).forEach(function (lobbyId) {
		var lobbyJson = {};
		var lobby = lobbies[lobbyId];
		lobbyJson["id"] = lobbyId;
		lobbyJson["owner"] = lobby.owner;
		lobbyJson["player_count"] = lobby.players.length;
		lobbyJson["options"] = lobby.options;
		//lobbyJson["words"] = lobby.words;
		lobbyJson["current_word_index"] = lobby.current_word_index;
		lobbyJson["players_submitted_word"] = lobby.players_submitted_word;
		lobbyJson["status"] = lobby.status;
		lobbiesJson.push(lobbyJson);
	});

	return lobbiesJson;
}

export function testOwnership(lobbyId, playerId) {
	var lobby = lobbies[lobbyId];
	if (lobby == undefined) {
		return false;
	}
	return lobby.owner == playerId;
}

export function levenshteinDistance(a, b) {
	if (a.length == 0) return b.length;
	if (b.length == 0) return a.length;

	let maxLength = Math.max(a.length, b.length);

	a = a.toLowerCase();
	b = b.toLowerCase();

	const arr = [];
	for (let i = 0; i <= a.length; i++) {
		arr[i] = [i];
		for (let j = 1; j <= b.length; j++) {
			arr[i][j] =
				i === 0
					? j
					: Math.min(
						arr[i - 1][j] + 1,
						arr[i][j - 1] + 1,
						arr[i - 1][j - 1] + (b[j - 1] === a[i - 1] ? 0 : 1)
					);
		}
	}
	return arr[a.length][b.length] / maxLength;
}

cron.schedule("* * * * * *", () => {
	Object.keys(lobbies).forEach(function (lobbyId) {
		var lobby = lobbies[lobbyId];
		if (lobby.status == "started" && lobby.options.round_timer != -1) {
			lobby.current_round_timer++;
			//console.log("Lobby " + lobbyId + " round timer : " + lobby.current_round_timer);
			let timerUpdate = { action: "timer-update", current_round_timer: lobby.current_round_timer };
			lobby.players.forEach((player) => player.websocket.send(JSON.stringify(timerUpdate)));
			if (lobby.current_round_timer >= lobby.options.round_timer) {
				lobby.players.forEach((player) => 
				{
					if(player.entered_word == "")
						receiveWord(lobbyId, player.id, "");
				});
			}
		}
	});
});

// Cleanup lobbies every 30 seconds
cron.schedule("30 * * * * *", () => {
	//console.log("Cleaning up old lobbies...");
	//console.log("Current lobbies (before cleanup) : " + Object.keys(lobbies).length);
	var lobbiesBeforeCleanup = Object.keys(lobbies).length;
	Object.keys(lobbies).forEach(function (lobbyId) {
		var lobby = lobbies[lobbyId];
		//console.log("Players in lobby (before cleanup) " + lobbyId + " : " + lobby.players.length);
		lobby.players.forEach((player) => {
			if(player.websocket.readyState != 1)
				leaveLobby(lobbyId, player.id);
		});
		//console.log("Players in lobby (after cleanup) " + lobbyId + " : " + lobby.players.length);
	});
	//console.log("Current lobbies (after cleanup) : " + Object.keys(lobbies).length);
	let lobbiesCleaned = lobbiesBeforeCleanup - Object.keys(lobbies).length;
	if(lobbiesCleaned > 0)
	console.log("Cleaned up " + lobbiesCleaned + " lobbies.");
});