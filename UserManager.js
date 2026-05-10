import * as DatabaseConnection from "./DatabaseConnection.js";
import * as Utils from "./Utils.js";

export async function createUser(username, first_name, last_name, password_hash) 
{
    let uuid = Utils.uuidv4();
    let result = await DatabaseConnection.createUser(uuid, username, first_name, last_name, password_hash);
    return { success: result, uuid: uuid };
}

export async function login(username, password_hash)
{
    try {
        let result = await DatabaseConnection.login(username, password_hash);
        if(result.success)
            return { success: true, uuid: result.uuid };
        return { success: false };
    } catch (error) {
        console.error("Error in login:", error);
        return { success: false };
    }
}

export async function getUserInfo(user_id)
{
    let result = await DatabaseConnection.getUserInfo(user_id);
    if(result.success)
        return { success: true, user_info: result.user_info };
    return { success: false };
}

export async function getUsersInfo(user_ids)
{
    let result = await DatabaseConnection.getUsersInfo(user_ids);
    if(result.success)
        return { success: true, users_info: result.users_info };
    return { success: false };
}

export async function updateUserScore(user_id, score)
{
    let result = await DatabaseConnection.updateUserScore(user_id, score);
    if(result.success)
        return { success: true, new_score: result.new_score };
    return { success: false };
}