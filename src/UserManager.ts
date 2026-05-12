import { DatabaseConnection } from "./DatabaseConnection.js";
import { Utils } from "./Utils/Utils.js";

export class UserManager
{
    public static async createUser(username: string, first_name: string, last_name: string, password_hash: string) 
    {
        let uuid = Utils.uuidv4();
        let result = await DatabaseConnection.CreateUser(uuid, username, first_name, last_name, password_hash);
        return { success: result, uuid: uuid };
    }

    public static async login(username: string, password_hash: string)
    {
        try {
            let result : any = await DatabaseConnection.Login(username, password_hash);
            if(result.success)
                return { success: true, uuid: result.uuid };
            return { success: false };
        } catch (error) {
            console.error("Error in login:", error);
            return { success: false };
        }
    }

    public static async getUserInfo(user_id: string)
    {
        let result : any = await DatabaseConnection.GetUserInfo(user_id);
        if(result.success)
            return { success: true, user_info: result.user_info };
        return { success: false };
    }

    public static async getUsersInfo(user_ids: string[])
    {
        let result : any = await DatabaseConnection.GetUsersInfo(user_ids);
        if(result.success)
            return { success: true, users_info: result.users_info };
        return { success: false };
    }

    public static async updateUserScore(user_id: string, score: number)
    {
        let result : any = await DatabaseConnection.UpdateUserScore(user_id, score);
        if(result.success)
            return { success: true, new_score: result.new_score };
        return { success: false };
    }
}

