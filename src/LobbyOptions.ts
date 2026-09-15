import { Constants } from "./Constants";

export enum LobbyMode
{
    Classic = 0,
    BattleRoyale = 1
}

export class LobbyOptions
{
    public max_words: number = 10;
    public categories: number = Constants.DEFAULT_CATEGORIES;
    public round_timer: number = 30;
    public similarity_threshold: number = 0.8;
    public lobby_mode: LobbyMode = LobbyMode.Classic;

    constructor(max_words?: number, categories?: number, round_timer?: number, similarity_threshold?: number, lobby_mode?: LobbyMode)
    {
        if (max_words !== undefined) this.max_words = max_words;
        if (categories !== undefined) this.categories = categories;
        if (round_timer !== undefined) this.round_timer = round_timer;
        if (similarity_threshold !== undefined) this.similarity_threshold = similarity_threshold;
        if (lobby_mode !== undefined) this.lobby_mode = lobby_mode;
    }

    public FromJson(json: any)
    {
        if (json.max_words !== undefined) this.max_words = json.max_words;
        if (json.categories !== undefined) this.categories = json.categories;
        if (json.round_timer !== undefined) this.round_timer = json.round_timer;
        if (json.similarity_threshold !== undefined) this.similarity_threshold = json.similarity_threshold;
        if (json.lobby_mode !== undefined) this.lobby_mode = json.lobby_mode;
    }

    public ToJson(): any
    {
        return {
            max_words: this.max_words,
            categories: this.categories,
            round_timer: this.round_timer,
            similarity_threshold: this.similarity_threshold,
            lobby_mode: this.lobby_mode
        };
    }
}