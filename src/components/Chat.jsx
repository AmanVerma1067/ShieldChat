import { useEffect, useState } from "react";
import { addDoc, collection, serverTimestamp, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { auth, db } from "../firebase-config"
import "../styles/Chat.css";
import { generateKeyFromPassword, encryptMessage, decryptMessage } from "../utils/crypto";

export const Chat = (props) => {
    const { room, roomPassword } = props;
    const [newMessage, setNewMessage] = useState("")
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cryptoKey, setCryptoKey] = useState(null);

    const messagesRef = collection(db, "messages");

    // Derive key when room or password changes
    useEffect(() => {
        const initKey = async () => {
            if (roomPassword) {
                try {
                    const key = await generateKeyFromPassword(roomPassword, room);
                    setCryptoKey(key);
                } catch (err) {
                    console.error("Key generation failed:", err);
                    setError("Failed to generate encryption key");
                }
            } else {
                setCryptoKey(null);
            }
        };
        initKey();
    }, [room, roomPassword]);

    useEffect(() => {
        setLoading(true);
        setError(null);

        const queryMessages = query(
            messagesRef,
            where("room", "==", room),
            orderBy("createdAt")
        );

        const unsuscribe = onSnapshot(
            queryMessages,
            (snapshot) => {
                let messages = [];
                const processMessages = async () => {
                    for (const doc of snapshot.docs) {
                        const data = doc.data();
                        let text = data.text;
                        let isEncrypted = false;

                        // Try to decrypt if we have a key and it looks like JSON
                        if (cryptoKey && text.startsWith('{') && text.includes('"iv":')) {
                            const decrypted = await decryptMessage(text, cryptoKey);
                            if (decrypted) {
                                text = decrypted;
                                isEncrypted = true;
                            } else {
                                text = "🔒 Encrypted Message (Wrong Password)";
                            }
                        } else if (text.startsWith('{') && text.includes('"iv":')) {
                            text = "🔒 Encrypted Message (Password Required)";
                        }

                        messages.push({ ...data, id: doc.id, text, isEncrypted });
                    }
                    setMessages(messages);
                    setLoading(false);
                    setError(null);
                };
                processMessages();
            },
            (error) => {
                console.error("Firestore error:", error);
                setError(
                    <div>
                        <p>Index required: {error.message}</p>
                        <a
                            href="https://console.firebase.google.com/project/ishan-saraswat/firestore/indexes"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'blue', textDecoration: 'underline' }}
                        >
                            Click here to create the required index
                        </a>
                        <p style={{ fontSize: '12px', marginTop: '10px' }}>
                            Or wait 2-5 minutes if you already created it
                        </p>
                    </div>
                );
                setLoading(false);
            }
        );

        return () => unsuscribe();
    }, [room, cryptoKey]); // Re-run when key changes to re-decrypt

    const handleSubmit = async (e) => {
        e.preventDefault();

        const trimmedMessage = newMessage.trim();
        if (trimmedMessage === "") {
            setNewMessage("");
            return;
        }

        if (!auth.currentUser) {
            setError("User not authenticated");
            return;
        }

        try {
            let messageText = trimmedMessage;
            if (cryptoKey) {
                messageText = await encryptMessage(trimmedMessage, cryptoKey);
            }

            await addDoc(messagesRef, {
                text: messageText,
                createdAt: serverTimestamp(),
                user: auth.currentUser.displayName || "Anonymous",
                room,
                userId: auth.currentUser.uid // Add user ID for better identification
            });
            setNewMessage("");
            setError(null);
        } catch (error) {
            console.error("Error sending message:", error);
            setError("Failed to send message: " + error.message);
        }
    }

    // Check if message is from current user
    const isCurrentUser = (messageUser) => {
        return auth.currentUser &&
            (messageUser === auth.currentUser.displayName ||
                messageUser === auth.currentUser.email);
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full w-full bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                <p className="text-gray-500 font-medium">Loading secure messages...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50 w-full relative">
            {/* Error Message */}
            {error && (
                <div className="absolute top-4 left-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl shadow-sm z-20 flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && !error ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-gray-500">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        </div>
                        <p className="font-semibold text-lg text-gray-700 mb-1">No messages yet</p>
                        <p className="text-sm">Be the first to start the secure conversation!</p>
                    </div>
                ) : (
                    messages.map((message) => {
                        const isSender = isCurrentUser(message.user);
                        return (
                            <div key={message.id} className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex flex-col max-w-[75%] ${isSender ? 'items-end' : 'items-start'}`}>
                                    {!isSender && (
                                        <span className="text-xs font-medium text-gray-500 ml-1 mb-1">{message.user}</span>
                                    )}
                                    <div 
                                        className={`px-4 py-2.5 rounded-2xl shadow-sm relative group
                                        ${isSender 
                                            ? 'bg-indigo-600 text-white rounded-tr-sm' 
                                            : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm'
                                        }`}
                                    >
                                        <p className="text-[15px] leading-relaxed break-words">{message.text}</p>
                                    </div>
                                    {message.createdAt && (
                                        <span className={`text-[10px] text-gray-400 mt-1 font-medium ${isSender ? 'mr-1' : 'ml-1'}`}>
                                            {new Date(message.createdAt.seconds * 1000).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                            {message.isEncrypted && <span className="ml-1 text-[10px] opacity-75">🔒</span>}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Input Area */}
            <div className="bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 w-full shrink-0">
                <form onSubmit={handleSubmit} className="flex gap-3 w-full relative">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="flex-1 bg-gray-100 border-none rounded-full py-3.5 px-6 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-[15px] shadow-sm placeholder-gray-400"
                        placeholder="Type a secure message..."
                        maxLength={500}
                        disabled={!!error}
                    />
                    <button 
                        type="submit" 
                        disabled={!newMessage.trim() || !!error}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-3.5 px-5 font-medium flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shrink-0"
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
};