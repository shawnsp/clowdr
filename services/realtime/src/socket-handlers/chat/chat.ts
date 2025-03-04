import assert from "assert";
import { Socket } from "socket.io";
import { is } from "typescript-is";
import { Room_ManagementMode_Enum } from "../../generated/graphql";
import { chatListenersKeyName, generateChatRoomName, socketChatsKeyName } from "../../lib/chat";
import { canSelectChat } from "../../lib/permissions";
import { redisClientP } from "../../redis";

export function onSubscribe(
    conferenceSlugs: string[],
    userId: string,
    socketId: string,
    socket: Socket
): (chatId: any) => Promise<void> {
    return async (chatId) => {
        if (chatId) {
            try {
                assert(is<string>(chatId), "Data does not match expected type.");

                if (
                    await canSelectChat(
                        userId,
                        chatId,
                        conferenceSlugs,
                        false,
                        "chat.onSubscribe:test-registrant-id",
                        "chat.onSubscribe:test-conference-id",
                        "chat.onSubscribe:test-room-id",
                        "chat.onSubscribe:test-room-name",
                        Room_ManagementMode_Enum.Public,
                        []
                    )
                ) {
                    const existingChats = await redisClientP.smembers(socketChatsKeyName(socketId));
                    if (!existingChats.includes(chatId)) {
                        socket.join(generateChatRoomName(chatId));

                        await redisClientP.sadd(chatListenersKeyName(chatId), `${socketId}¬${userId}`);
                        await redisClientP.sadd(socketChatsKeyName(socketId), chatId);
                    }
                }
            } catch (e) {
                console.error(`Error processing chat.subscribe (socket: ${socketId}, chatId: ${chatId})`, e);
            }
        }
    };
}

export function onUnsubscribe(
    conferenceSlugs: string[],
    userId: string,
    socketId: string,
    socket: Socket
): (chatId: any) => Promise<void> {
    return async (chatId) => {
        if (chatId) {
            try {
                assert(is<string>(chatId), "Data does not match expected type.");

                if (
                    await canSelectChat(
                        userId,
                        chatId,
                        conferenceSlugs,
                        false,
                        "chat.onSubscribe:test-registrant-id",
                        "chat.onSubscribe:test-conference-id",
                        "chat.onSubscribe:test-room-id",
                        "chat.onSubscribe:test-room-name",
                        Room_ManagementMode_Enum.Public,
                        []
                    )
                ) {
                    socket.leave(generateChatRoomName(chatId));
                    await redisClientP.srem(chatListenersKeyName(chatId), `${socketId}¬${userId}`);
                    await redisClientP.srem(socketChatsKeyName(socketId), chatId);
                }
            } catch (e) {
                console.error(`Error processing chat.unsubscribe (socket: ${socketId}, chatId: ${chatId})`, e);
            }
        }
    };
}
