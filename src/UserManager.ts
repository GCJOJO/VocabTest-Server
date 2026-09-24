import { DatabaseConnection } from "./DatabaseConnection";
import { SessionManager } from "./SessionManager";
import { Utils } from "./Utils/Utils";

export class UserManager
{
    public static check_password(password : string, stored_password : string) : Promise<boolean>
    {
        return Bun.password.verify(password, stored_password);
    }

    public static hash_password(password : string) : Promise<string>
    {
        return Bun.password.hash(password);
    }

    public static async createUser(username: string, first_name: string, last_name: string, password: string) 
    {
        let uuid = Utils.uuidv4();
        let password_hash = await this.hash_password(password);
        let result = await DatabaseConnection.createUser(uuid, username, first_name, last_name, password_hash);
        const new_token = SessionManager.create_session(uuid);
        return { success: result, uuid: uuid, token : new_token };
    }

    public static async login(username: string, password: string)
    {
        try {
            let result : any = await DatabaseConnection.login(username, password);
            if(result.success)
            {
                const new_token = SessionManager.create_session(result.uuid);
                return { success: true, uuid: result.uuid, token : new_token };
            }
            return { success: false };
        } catch (error) {
            console.error("Error in login:", error);
            return { success: false, "error" : error };
        }
    }

    public static async getUserInfo(user_id: string)
    {
        let result : any = await DatabaseConnection.getUserInfo(user_id);
        if(result.success)
            return { success: true, user_info: result.user_info };
        return { success: false };
    }

    public static async getUsersInfo(user_ids: string[])
    {
        let result : any = await DatabaseConnection.getUsersInfo(user_ids);
        if(result.success)
            return { success: true, users_info: result.users_info };
        return { success: false };
    }

    public static async updateUserScore(user_id: string, score: number)
    {
        let result : any = await DatabaseConnection.updateUserScore(user_id, score);
        if(result.success)
            return { success: true, new_score: result.new_score };
        return { success: false };
    }
}

