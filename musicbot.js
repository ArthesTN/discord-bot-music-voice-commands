require("dotenv").config();
const { Client, Intents, Collection, VoiceChannel, GuildMember, MessageEmbed, Permissions } = require("discord.js");
const { joinVoiceChannel, getVoiceConnection, VoiceConnection,AudioPlayerStatus } = require('@discordjs/voice');
const { VoiceConnectionStatus, entersState, createAudioPlayer } = require('@discordjs/voice');
const fs = require("fs");
const { Readable } = require('stream');
const ffmpeg = require('ffmpeg');
var exec = require('child_process').exec;
const path = require("path")
const voice_1 = require("@discordjs/voice");
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const prism_media_1 = __importDefault(require("prism-media"));
const stream_1 = require("stream");
const ytdl = require('ytdl-core')
const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_VOICE_STATES,
        Intents.FLAGS.GUILD_MEMBERS
    ]
});
const yts = require('yt-search')
const discordbot2 = __dirname
const speechpath = path.join(discordbot2, "speechaudios")
const botSounds = path.join(discordbot2, "botSounds")
var guildSettings = {
    transcriptionSetting: false,
    joinInitMessageSetting: null,
    maxQueueSizeSetting: 20
}
var guildMap = new Map()
client.on("ready", () => {
    var deletewavs = path.join(discordbot2, 'deletewavs.py')
    exec('python ' + deletewavs, function (err, stdout, stderr) {
        if (err) {
            console.error(stderr);
            console.log("could not delete wav files")
        }
        console.log("recordings are deleted")
    });
    const Guilds = client.guilds.cache.map(guild => guild.id)
    for (let index = 0; index < Guilds.length; index ++){
        // create shallow copy
        // modifications to one key's value don't affect other keys
        guildMap.set(Guilds[index], {...guildSettings})
    }
    console.log("Successfully connected.");
})
client.on('guildCreate', guild => {
    guildMap.set(guild.id, {...guildSettings})
});
// user changing voice state will make bot not listen to user until 3 speechAudio files are clean
client.on('voiceStateUpdate', async( oldState, newState)=>{
    const oldChannel = oldState.channel
    const newChannel = newState.channel
    if (oldChannel !== newChannel){
        if (!newChannel) {
            if (oldState.member.id !== client.user.id){    
                try { 
                    // time out the 3 speech files
                    voiceTimeOut(oldState.member.id)
                } catch (error) {
                    console.log(oldChannel?.guild?.name + ": " + error.message)
                }
            }
            else{

                defaultGuildSetting(oldChannel.guildId)
            }
        }    
    }
})
async function toggleTranscription(message){
    const guildID = message.guildId
    if (!guildMap.has(guildID)){
        guildMap.set(guildID, guildSettings)
    }
    const guildSetting = guildMap.get(guildID);
    const initJoinMessageChannel = guildSetting.joinInitMessageSetting?.channel
    if (!initJoinMessageChannel){
        content = "I'm not in voice channel or the original join text channel access is gone"
        await sendMessage(message, content)
        return
    }
    guildSetting.transcriptionSetting  = !guildSetting.transcriptionSetting
    guildMap.set(guildID, guildSetting);
    var content = ""
    if (guildSetting.transcriptionSetting) {
        content = "turned on transcription at " + initJoinMessageChannel.name  
    }
    else {
        content = "turned off transcription at " + initJoinMessageChannel.name
    }
    await sendMessage(message, content)
    return

}
function voiceTimeOut(id){
    const pcmfilename = path.join(speechpath,`pcm${id}.pcm`)
    const wavfilename = path.join(speechpath,`wav${id}.wav`)
    const txtfilename = path.join(speechpath,`txt${id}.txt`)
    deleteFileNoCare(pcmfilename)
    deleteFileNoCare(wavfilename)
    deleteFileNoCare(txtfilename)
}
function deleteFileNoCare(filePath, maxRetries = 5, retryInterval = 1000) {
    let retries = 0;

    function deleteAttempt() {
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                // File doesn't exist, no need to delete, exit retry loop
                return;
            }

            fs.unlink(filePath, (err) => {
                if (!err) {
                    // File was successfully deleted, exit retry loop
                    return;
                }

                if (retries < maxRetries) {
                    retries++;
                    setTimeout(deleteAttempt, retryInterval);
                } else {
                    console.log("Could not delete " + filePath);
                }
            });
        });
    }
    deleteAttempt();
}
// start of listening to user, opus stream to pcm stream
async function stream2pcm(voiceConnection, message){
    user = message.member
    voiceConnection.receiver.speaking.on('start', userId => {
        const speaker = message.guild.members.cache.get(userId);
        // do not listen to other bots
        if (speaker && !speaker.user.bot){
            const passThrough = new stream_1.PassThrough();

            const opusStream = voiceConnection.receiver.subscribe(userId, {
                end: {
                    behavior: voice_1.EndBehaviorType.AfterSilence,
                    duration: 200
                }
            });
            const pcmStream = new prism_media_1.default.opus.Decoder({
                channels: 2,
                frameSize: 960,
                rate: 48000
            })
            setImmediate(() => {    
                opusStream.pipe(pcmStream);
                pcmStream.pipe(passThrough);
            })

            // prevent abuse by only recording the first 10 seconds
            // if someone were to put long continuous audio on mic
            // no worries for human speaking because after 200 milis of silence
            // the audio recording would start again
            
            let timeout = setTimeout(() => {
                opusStream.on('end', () => {
                    //console.log('Readable stream has ended in TimeOut.');
                    return
                });
                opusStream.push(null);
              }, 10000);
            opusStream.on('end', () => {
                //console.log('Readable stream has ended.');
                clearTimeout(timeout);
            });
            const voiceFiles = {
                PCM: path.join(speechpath,`pcm${userId}.pcm`),
                WAV: path.join(speechpath,`wav${userId}.wav`),
                TXT: path.join(speechpath,`txt${userId}.txt`)
            } 
            fs.writeFile(voiceFiles.TXT, '', (err) => {
                if (err) {
                    console.log("could not create initial txt file");
                    return
                }
                stream2file(passThrough, voiceConnection, user, message, voiceFiles, userId)
              });
              
        } else {
            // cache first time speakers, this is to first check if they are bots
            try {
                message.guild?.members.fetch(userId);
            } catch (error) {
                console.log(message.guild?.name + ": " + error.message)
            }
        }    
    })
}
// pcm to wav
async function stream2file(passThrough, voiceConnection, user, message, voiceFiles, userId){
    const writer = passThrough.pipe(fs.createWriteStream(voiceFiles.PCM));
    await writer.once("finish", () => {
        fs.access(voiceFiles.PCM, fs.constants.F_OK, (err) => {
            if (err) {
                return;
            } else {
              exec('ffmpeg -f s16le -ar 44.1k -ac 2 -y -i ' + voiceFiles.PCM + ' ' +
                voiceFiles.WAV, function (err, stdout, stderr) {

                if (err) {
                    console.log("pcm to wav error")
                    return
                }
                pythonspeech(voiceConnection, user, message, voiceFiles, userId)
                }); 
            }
        });
     
    })
}
// wav to txt
async function pythonspeech(voiceConnection, user, message, voiceFiles, userId){
    const convert1 = path.join(discordbot2, 'convert1.py')
    fs.access(voiceFiles.WAV, fs.constants.F_OK, (err) => {
        if (err){  
            return;   
        }
        exec('python ' + convert1 + ' ' + voiceFiles.WAV + ' ' + voiceFiles.TXT, 
        function (err, stdout, stderr) {
            if (err) {
                console.log("wav to txt error")
                return
            }
            fs.access(voiceFiles.TXT, fs.constants.F_OK, (err) => {
                if (err) {
                    console.log("could not access txt file")
                    return;
                }
                fs.readFile(voiceFiles.TXT, 'utf8', (err, data)=>{
                    if (err){
                        console.log("could not read txt file")  
                        return;
                    }  
                    const member = message.guild.members.cache.get(userId)
                    if (data.length > 0){
                        if (guildMap.get(message.guildId).transcriptionSetting){
                            var content = member.displayName + ": " + data
                            // original join command text channel
                            const guildID = message.guildId
                            sendMessage(guildMap.get(guildID).joinInitMessageSetting,content)
                        }
                    }
                    voicecommands(voiceConnection, user, message, data, userId).then(value =>{ 
                        try {
                            emptyAFile(voiceFiles.TXT)
                        } catch (error) {
                            console.error('Error:', error);
                        }         
                    })    
                })
            })     
        });
    })
}
function emptyAFile(filePath){
    fs.open(filePath, 'r+', (err, fileDescriptor) => {
        if (err) {
          console.error('Error opening the file:', err);
          return;
        }
        fs.ftruncate(fileDescriptor, 0, (err) => {
          if (err) {
            console.error('Error truncating the file:', err);
            return
          } 
            fs.close(fileDescriptor, (err) => {
                if (err) {
                console.error('Error closing the file:', err);
                } 
            });
        });
    });
}
const settings = {
    prefix: '!',
};

const { Player } = require("@jadestudios/discord-music-player");
const player = new Player(client, {
    leaveOnEmpty: true,
    leaveOnStop: false,
    leaveOnEnd: false,
    deafenOnJoin: false,
    timeout: 180000, // 180000 is 3 minutes
    
});
const commands = {
    join: {write: "join", emoji: ":microphone2:", 
        help: "not supported", helpFurther: "join your voice channel" },
    leave: {write: "leave", emoji: ":door:", 
        help: "not supported", helpFurther: "leave voice channel"},
    play: {write: "play", emoji: ":musical_note:", 
        help: "play music", helpFurther: "play your queried song | add song to the queue",
        say: ["play music"], argument: "{song}"},
    playlist: {write: "playlist", emoji: ":notes:", 
        help: "not supported", helpFurther: "play your queried playlist | add playlist to the queue", argument: "{playlist}"},
    pause: {write: "pause", emoji: ":pause_button:", 
        help: "pause the music | time out", helpFurther: "pause the current song",
        say: ["pause the music", "time out" ]},
    unpause: {write: "unpause", emoji: ":arrow_forward:", 
        help: "resume/unpause/continue the music", helpFurther: "unpause the current song",
        say: ["resume the music", "unpause the music", "continue the music"]},
    repeat: {write: "repeat", emoji: ":one::repeat:", 
        help: "repeat this song", helpFurther: "play this song again next",
        say: ["repeat this song"]},
    seek: {write: "seek", emoji: ":fast_forward:", 
        help: "go/seek to", helpFurther: "forward to a chosen time in the song",
        say: ["go to", "seek to" ], argument: "{hh:mm:ss} | {combinations of numbers and time hands}"},
    skip: {write: "skip", emoji: ":track_next:", 
        help: "skip this song", helpFurther: "skip the current song",
        say: ["skip this song"]},
    skipto: {write: "skipto", emoji: ":scissors::track_next:", 
        help: "skip to song", helpFurther: "skip to the numbered song in the queue",
        say: ["skip to song"], argument: "{song number}"},
    shuffle: {write: "shuffle", emoji: ":twisted_rightwards_arrows:", 
        help: "shuffle the music", helpFurther: "shuffle the queue",
        say: ["shuffle the music"]},
    queue: {write: "queue", emoji: ":regional_indicator_q:", 
        help: "show me the queue", helpFurther: "check the songs in the queue",
        say: ["show me the queue"], argument: "{optional page number}"},
    remove: {write: "remove", emoji: ":x:", 
        help: "remove song", helpFurther: "remove a numbered song from the queue",
        say: ["remove song"], argument: "{song number}"},
    clearqueue: {write: "clearqueue", emoji: ":one:", 
        help: "clear the queue", helpFurther: "clear out the current queue of songs",
        say: ["clear the queue"]},
    stop: {write: "stop", emoji: ":octagonal_sign:", 
        help: "stop singing | stop music | stop the music", helpFurther: "remove every song and stop playing music",
        say: ["stop singing", "stop music", "stop the music"]},
    write: {write: "write", emoji: ":writing_hand:", 
        help: "not supported", helpFurther: "toggle speech to text of voices in my voice channel"},
    help: {write: "help", emoji: ":sos:", 
        help: "not supported", helpFurther: "other minimized help board"},
    helpFurther: {write: "helpfurther", emoji: ":sos::sos: ", 
        help: "not supported" , helpFurther: "this further clarified help board"}
}
// You can define the Player as *client.player* to easily access it.
client.player = player
const { RepeatMode } = require('@arthestn/discord-music-player');
// text channel could be deleted while in voice channel
// check if tc still existed before sending a message
client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(settings.prefix) || message.author.bot || !message.content.length > 100) {
        return 
    }
    const args = message.content.slice(settings.prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    const memberRequester = message.member
    if(command === commands.join.write){
        try {
            await connectToChannel(message);
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return 
    }
    if(command === commands.leave.write) {
        try {
            await leaveChannel(message)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.help.write){
        try {
            await help(message)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.helpFurther.write){
        try {
            await helpFurther(message)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.play.write) {
        try {
            const search = args.join(' ')
            await play(message, search, memberRequester)  
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.playlist.write) {
        try {
            const search = args.join(' ')
            await playlist(message, search, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.skip.write) {
        try {
            await skip(message, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.clearqueue.write) {
        try {
            await clearQueue(message, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.stop.write) {
        try {
            await stop(message, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.pause.write) {
        try {
            await pause_playing(message, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.unpause.write) {
        try {
            await unpause_playing(message, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.shuffle.write) {
        try {
            await shuffle(message, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.write.write){
        try {
            await toggleTranscription(message)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.skipto.write){
        try {
            const songNumber = args[0]
            await skipTo(message, songNumber, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.queue.write) {
        try {
            const pageNumber = args[0]
            await getQueue(message, pageNumber)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.remove.write) {
        try {
            const songNumber = args[0]
            await remove(message, songNumber, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.seek.write) {
        try {
            const seekTime = args.join(' ')
            await seek(message, seekTime, memberRequester);
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }
    if(command === commands.repeat.write) {
        try {
            await repeatSong(message, memberRequester)
        }
        catch (error){
            console.log(message.guild?.name + ": " + error.message)
        }
        return
    }

})
async function voicecommands(voiceConnection, user, message, transcribe, userId){
    if (!transcribe){
        return
    }
    const memberRequester = message.guild.members.cache.get(userId)
    transcribe = transcribe.toLowerCase()
    if (commands.clearqueue.say){
        for (const command of commands.clearqueue.say){
            if (transcribe.includes(command)) {
                try {
                    await clearQueue(message, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.play.say){
        for (const command of commands.play.say){
            if (transcribe.includes(command)) {
                const l = command.length
                const start = transcribe.lastIndexOf(command)
                const search = transcribe.slice(start + l, transcribe.length)
                try {
                    await play(message, search, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.pause.say){
        for (const command of commands.pause.say){
            if (transcribe.includes(command)) {
                try {
                    await pause_playing(message, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.queue.say){
        for (const command of commands.queue.say){
            if (transcribe.includes(command)) {
                const l = command.length
                const start = transcribe.lastIndexOf(command)
                const pageNumber = transcribe.slice(start + l, transcribe.length)
                try {
                    await getQueue(message, pageNumber, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.remove.say){
        for (const command of commands.remove.say){
            if (transcribe.includes(command)) {
                const l = command.length
                const start = transcribe.lastIndexOf(command)
                const songNumber = transcribe.slice(start + l, transcribe.length)
                try {
                    await remove(message, songNumber, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.repeat.say){
        for (const command of commands.repeat.say){
            if (transcribe.includes(command)) {
                try {
                    await repeatSong(message, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.seek.say){
        for (const command of commands.seek.say){
            if (transcribe.includes(command)) {
                const l = command.length
                const start = transcribe.lastIndexOf(command)
                const seconds = transcribe.slice(start + l, transcribe.length)
                try {
                    await seek(message, seconds, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.shuffle.say){
        for (const command of commands.shuffle.say){
            if (transcribe.includes(command)) {
                try {
                    await shuffle(message, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.skip.say){
        for (const command of commands.skip.say){
            if (transcribe.includes(command)) {
                try {
                    await skip(message, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.skipto.say){
        for (const command of commands.skipto.say){
            if (transcribe.includes(command)) {
                const l = command.length
                const start = transcribe.lastIndexOf(command)
                const songNumber = transcribe.slice(start + l, transcribe.length)
                try {
                    await skipTo(message, songNumber, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
    if (commands.stop.say){
        for (const command of commands.stop.say){
            if (transcribe.includes(command)) {
                try {
                    await stop(message, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }

    if (commands.unpause.say){
        for (const command of commands.unpause.say){
            if (transcribe.includes(command)) {
                try {
                    await unpause_playing(message, memberRequester)
                }
                catch (error){
                    console.log(message.guild?.name + ": " + error.message)
                }
                return
            }
        }
    }
}

function emptymessageEmbed(content){
    const length = content.embeds?.length
    for(let i = 0; i < length; i++){
        const messageEmbedElement = content.embeds[i]
        if (!messageEmbedElement.title &&
             !messageEmbedElement.description && 
             messageEmbedElement.fields.length === 0 && 
             !messageEmbedElement.footer
        ) {
            return true
        }
    }
    return false    
}
async function sendMessage(message, content){
    if(!message || !content || !message.channel){
        return
    }
    if (!(typeof message === 'string') && emptymessageEmbed(content)){
        return
    }
    const me = message.guild?.members?.me;
    const channelPermissions = message.channel?.permissionsFor(me);
    if (!channelPermissions || 
        !channelPermissions.has(Permissions.FLAGS.VIEW_CHANNEL) ||
        !channelPermissions.has(Permissions.FLAGS.SEND_MESSAGES) ||
        !channelPermissions.has(Permissions.FLAGS.EMBED_LINKS)
        ) {
        return
    }
    try {
        await message.channel?.sendTyping();
        await message.channel?.send(content);
    } catch (error){
        console.log(message.guild?.name + ": " + error.message)
    }
 
}
async function leaveChannel(message){
    const myCurrChannel = message.guild?.members?.me?.voice?.channel
    var content = "" 
    if(!myCurrChannel){
        content = "I'm not in a voice channel"
        await sendMessage(message, content);
        return
    }
    const guildID = message.guildId
    defaultGuildSetting(guildID)
    let guildQueue = client.player.getQueue(guildID);
    if (guildQueue){
        guildQueue.leave()
        const embed = new MessageEmbed()
        .setDescription("adios my wretched guardians")
        content = {embeds : [embed]}
        await sendMessage(message, content)
        return
    }
}
function defaultGuildSetting(guildID){
    guildMap.set(guildID, {...guildSettings});
}    
async function connectToChannel(message) {
    // check for permission first
    const myCurrChannel = message.guild.members.me.voice?.channel
    const memberRequesterChannel = message.member.voice?.channel
    const guildID = message.guildId
    var content = ""
    if (!memberRequesterChannel){
        content = "get in voice channel"
        await sendMessage(message, content)
        return
    }
    const me = message.guild.members.me
    const oldChannelPermissions = myCurrChannel?.permissionsFor(me);
    const newChannelPermissions = memberRequesterChannel?.permissionsFor(me);
    if (!newChannelPermissions) {
        content = "what... Just give me default permission"
        await sendMessage(message, content)
        return
    }
    if (!newChannelPermissions.has(Permissions.FLAGS.VIEW_CHANNEL)) {
        content = "I do not have permission to view your mysterious voice channel"
        await sendMessage(message, content)
        return
    }
    if (!newChannelPermissions.has(Permissions.FLAGS.CONNECT)) {
        content = "I do not have permission to connect to your cool voice channel"
        await sendMessage(message, content)
        return
    }
    if (!newChannelPermissions.has(Permissions.FLAGS.SPEAK)) {
        content = "I do not have permission to speak in your exalted voice channel anyways. Why bother?"
        await sendMessage(message, content)
        return
    }
    if (!newChannelPermissions.has(Permissions.FLAGS.USE_VAD)) {
        content = "I do not have permission to use voice activities in your premium voice channel"
        await sendMessage(message, content)
        return
    }
    if (myCurrChannel && myCurrChannel.id === memberRequesterChannel.id){
        content = "But I'm already here"
        await sendMessage(message, content)
        return
    }
    if (myCurrChannel && myCurrChannel.id !== memberRequesterChannel.id){
        if (!oldChannelPermissions.has(Permissions.FLAGS.MOVE_MEMBERS)) {
            content = "I do not have permission to move myself. Stinky mods. Just add me with all " +
            "the permissions I need! "
            await sendMessage(message, content)
            return
        }
        await me.voice.setChannel(memberRequesterChannel);
        return
    }
    let guildQueue = client.player.createQueue(message.guildId);
    guildQueue.setData({
        queueInitMessage: message
    });
    // use retrieve, modify, and set
    const guildSetting = guildMap.get(guildID);
    guildSetting.joinInitMessageSetting = message
    guildMap.set(guildID, guildSetting);
    await guildQueue.join(message.member.voice.channel);
    const voiceConnection = guildQueue.connection?.connection
    if(voiceConnection){
        const embed = new MessageEmbed()
        .setDescription("I'm in")
        content = {embeds : [embed]}
        await sendMessage(message, content)
        stream2pcm(voiceConnection, message)
    }
}

async function play(message, search, memberRequester){
    const myCurrChannel = message.guild.members.me.voice.channel
    const memberRequesterChannel = memberRequester.voice.channel
    var content = ""
    if (!memberRequesterChannel){
        content = "get in voice channel"
        await sendMessage(message, content)
        return
    }
    if (!myCurrChannel) {
        await connectToChannel(message)
    }
    if(myCurrChannel && myCurrChannel.id !== memberRequesterChannel.id){
        content = "we are worlds apart, get in my voice channel"
        await sendMessage(message, content)
        return
    }
    let guildQueue = client.player.getQueue(message.guildId);
    if (!guildQueue){
        return
    }
    await guildQueue.join(message.member.voice.channel);
    if (!search){
        return
    }
    if (guildQueue.songs.length > 21){
        content = "Sorry! There can only be 20 songs in the queue at the time"
        await sendMessage(message, content)
        return
    }
    let song = await guildQueue.play(search).catch(_ => {
        if(!guildQueue)
            guildQueue.stop();
    });
    if (song) {
        song["requestedBy"] = memberRequester
    }
}
async function playlist(message, search, memberRequester){
    const myCurrChannel = message.guild.members.me.voice.channel
    const memberRequesterChannel = memberRequester.voice.channel
    var content = ""
    if (!memberRequesterChannel){
        content = "get in voice channel"
        await sendMessage(message, content)
        return
    }
    if (!myCurrChannel) {
        await connectToChannel(message) 
    }
    if(myCurrChannel && myCurrChannel.id !== memberRequesterChannel.id){
        content = "we are worlds apart, get in my voice channel"
        await sendMessage(message, content)
        return
    }
    let guildQueue = client.player.getQueue(message.guildId);
    if (!guildQueue){
        return
    }
    await guildQueue.join(message.member.voice.channel);
    if (!search){
        return
    }
    if (guildQueue.songs.length > 21){
        content = "Sorry! There can only be 20 songs in the queue at the time"
        await sendMessage(message, content)
        return
    }
    let playlist = await guildQueue.playlist(search).catch(_ => {
        if(!guildQueue)
            guildQueue.stop();
    });
    if(playlist){
        for (var i = 0; i < playlist.songs.length; i++){
            playlist.songs[i]["requestedBy"] = memberRequester
        }
    }
    if (guildQueue.songs.length > 21){
        var newSongs = guildQueue.songs.slice(0, 21);
        guildQueue.songs = newSongs
    }
}

async function help(message){
    var content = ""
    const exampleEmbed = new MessageEmbed()
        .setTitle("Commands - use with prefix " + '"' + settings.prefix + '"');
    for (const key in commands) {
        var name = commands[key].emoji + " " + commands[key].write
        var value = "voice: " + commands[key].help
        if (commands[key].argument){
            name += " " + commands[key].argument
            if (commands[key].say)
                value += " " + commands[key].argument
        }
        exampleEmbed.addFields({name: name, value: value})
      }
    content = {embeds: [exampleEmbed]}
    await sendMessage(message, content)
}
async function helpFurther(message){
    var content = ""
    const exampleEmbed = new MessageEmbed()
        .setTitle("Commands Clarification");
    for (const key in commands) {
        var name = commands[key].emoji + " " + commands[key].write
        var value = "Use: " + commands[key].helpFurther
        exampleEmbed.addFields({name: name, value: value})
      }
    content = {embeds: [exampleEmbed]}
    await sendMessage(message, content)
}
async function skip(message, memberRequester){
    let guildQueue = client.player.getQueue(message.guildId);
    var content = ""
    if (!guildQueue || !guildQueue.connection || guildQueue.destroyed || guildQueue.songs?.length === 0){
        content = "There is no music"
        await sendMessage(message, content)
        return
    }
    guildQueue.skip()
    const requesterName = memberRequester.displayName
    const exampleEmbed = new MessageEmbed()
    .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
    .setDescription(`Into the Future`)
    content = { embeds: [exampleEmbed] }
    await sendMessage(message, content)
}

async function clearQueue(message, memberRequester){
    let guildQueue = client.player.getQueue(message.guildId);
    var content = ""
    if (!guildQueue || guildQueue.destroyed || guildQueue.songs?.length === 0){
        content = "There is no music"
        await sendMessage(message, content)
        return
    }
    guildQueue.clearQueue();
    const requesterName = memberRequester.displayName
    const exampleEmbed = new MessageEmbed()
    .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
    .setDescription('music for me, not for thee - ' + guildQueue.songs[0].name)
    content = { embeds: [exampleEmbed] }
    await sendMessage(message, content);
    return
}
async function stop(message, memberRequester){
    let guildQueue = client.player.getQueue(message.guildId);
    var content = ""
    if (!guildQueue || guildQueue.destroyed || guildQueue.songs?.length === 0){
        content = "There is no music"
        await sendMessage(message, content)
        return
    }
    guildQueue.clearQueue();
    guildQueue.skip()
    const requesterName = memberRequester.displayName
    const exampleEmbed = new MessageEmbed()
    .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
    .setDescription('music is no more')
    .setThumbnail("https://i.kym-cdn.com/entries/icons/mobile/000/024/599/jazz.jpg")
    content = { embeds: [exampleEmbed] }
    await sendMessage(message, content);
    return
}
async function pause_playing(message, memberRequester){
    let guildQueue = client.player.getQueue(message.guildId);
    var content = ""
    if (!guildQueue || !guildQueue.connection || guildQueue.destroyed || guildQueue.songs?.length === 0){
        content = "There is no music"
        await sendMessage(message, content)
        return
    }
    if (guildQueue.isPlaying && !guildQueue.connection.paused){
        guildQueue.setPaused(true);
        const requesterName = memberRequester.displayName
        const exampleEmbed = new MessageEmbed()
        .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
        .setDescription(`Music Paused`)
        content = { embeds: [exampleEmbed] }
        await sendMessage(message, content)
    }
    return
}

async function unpause_playing(message,  memberRequester){
    let guildQueue = client.player.getQueue(message.guildId);
    var content = ""
    if (!guildQueue || !guildQueue.connection || guildQueue.destroyed || guildQueue.songs?.length === 0){
        content = "There is no music"
        await sendMessage(message, content)
        return
    }
    if (guildQueue.isPlaying && guildQueue.connection.paused){
        guildQueue.setPaused(false);
        const requesterName = memberRequester.displayName
        const exampleEmbed = new MessageEmbed()
        .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
        .setDescription(`Music Unpaused`)
        .setThumbnail("https://c.tenor.com/1lAVaFLAuQcAAAAC/go-on-pulp-fiction-samueel-l-jackson.gif")
        content = { embeds: [exampleEmbed] }
        sendMessage(message, content)
    }
    return
}
async function shuffle(message, memberRequester){
    let guildQueue = client.player.getQueue(message.guildId);
    var content = ""
    if (!guildQueue || guildQueue.destroyed || guildQueue.songs?.length < 2){
        content = "Can't shuffle with 0 or 1 song"
        await sendMessage(message, content)
        return
    }
    guildQueue.shuffle();
    const requesterName = memberRequester.displayName
    const exampleEmbed = new MessageEmbed()
    .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
    .setDescription(`Music Shuffled`)
    content = { embeds: [exampleEmbed] }
    sendMessage(message, content)
    return
}
async function getQueue(message,pageNumber){
    let guildQueue = client.player.getQueue(message.guildId);
    var content = ""
    if(!guildQueue || guildQueue.destroyed || guildQueue.songs?.length === 0){
        content = "There are no songs in the playlist"
        await sendMessage(message, content)
        return
    }
    const totalPages = Math.ceil(guildQueue.songs.length / 10) || 1
    pageNumber = getFirstNumberFromString(pageNumber)
    if (pageNumber && pageNumber > totalPages) {
        content = `Invalid Page.\n
        There are only a total of ${totalPages} pages of songs`
        await sendMessage(message, content)
        return
    }
    // turn pageNumber from 1 index to 0 index for queue
    pageNumber = !pageNumber ? 0 : pageNumber - 1
    
    const queueString = guildQueue.songs.slice(pageNumber * 10 + 1, pageNumber * 10 + 10).map((Song, i) => {
            return `**${pageNumber * 10 + i + 1}.** \`[${Song.duration}]\` ${Song.name}
             -- <@${Song.requestedBy?.id}>`
        }).join("\n")
    const currentSong = guildQueue.songs[0]
    content = {
        embeds: [
            new MessageEmbed()
                .setDescription(`**Currently Playing**\n` +
                (currentSong ? `\`[${currentSong.duration}]\` ${currentSong.name} -- 
                <@${currentSong.requestedBy?.id}>` : "None") +
                `\n\n**Queue**\n${queueString}`
                )
                .setFooter({
                    text: `Page ${pageNumber + 1} of ${totalPages}`
                })
                .setThumbnail(currentSong.setThumbnail)
        ]
    }
    await sendMessage(message, content)
    return
}
async function skipTo(message, songNumber, memberRequester){
    songNumber = getFirstNumberFromString(songNumber);
    var content = ""
    if (!songNumber){
        content = "Invalid number"
        await sendMessage(message, content)
        return
    }
    let guildQueue = client.player.getQueue(message.guildId);
    if (!guildQueue || guildQueue.destroyed || guildQueue.songs?.length === 0){
        content = "There is no music"
        await sendMessage(message, content)
        return
    }
    songNumber = Math.abs(songNumber)
    if (guildQueue.songs.length < songNumber ||  !guildQueue.isPlaying) {
        content = songNumber.toString() + " is above the queue size"
        await sendMessage(message, content)
        return
    }
    guildQueue.songs.splice(0, songNumber - 1)
    await skip(message, memberRequester)
    return
}

async function remove(message, songNumber, memberRequester){
    songNumber = getFirstNumberFromString(songNumber)
    var content = ""
    if (!songNumber){
        content = "Invalid number"
        await sendMessage(message, content)
        return
    }
    let guildQueue = client.player.getQueue(message.guildId);
    if (!guildQueue || guildQueue.destroyed || guildQueue.songs?.length === 0){
        content = "There is no music"
        await sendMessage(message, content)
        return
    }
    songNumber = Math.abs(songNumber)
    if (guildQueue.songs.length < songNumber ||  !guildQueue.isPlaying) {
        content = songNumber.toString() + " is above the queue size"
        await sendMessage(message, content)
        return
    }
    song = guildQueue.songs[songNumber]
    guildQueue.remove(songNumber)
    const requesterName = memberRequester.displayName
    const exampleEmbed = new MessageEmbed()
    .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
    .setDescription(`Song: ` + song.name + " skipped")
    content = { embeds: [exampleEmbed] }
    await sendMessage(message, content)
    return
}
async function seek(message, timeString, memberRequester){
    var timeInSeconds = colonTimeToSeconds(timeString)
    var content = ""
    if (timeInSeconds === null) {
        timeInSeconds = wordTimeToSeconds(timeString)
        if (timeInSeconds === null) {
            content = "Invalid time\n" + 
            "try 00:3:14 | 3 minutes 14 seconds | 194 seconds"
            await sendMessage(message, content)
            return
        }
    }
    let guildQueue = client.player.getQueue(message.guildId);
    if (!guildQueue || guildQueue.destroyed || guildQueue.songs?.length === 0 || !guildQueue.isPlaying){
        content = "There is no music"
        await sendMessage(message, content)
        return
    }
    guildQueue.seek(Math.abs(timeInSeconds * 1000))
    const requesterName = memberRequester.displayName
    const exampleEmbed = new MessageEmbed()
    .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
    .setDescription("seek to " + secondsToReadableTime(timeInSeconds))
    content = { embeds: [exampleEmbed] }
    await sendMessage(message, content)
}

async function repeatSong(message, memberRequester){
    let guildQueue = client.player.getQueue(message.guildId);
    var content = ""
    if (!guildQueue || guildQueue.destroyed || guildQueue.songs?.length === 0){
        content = "There is no music"
        await sendMessage(message, content)
        return
    }
    currSong = guildQueue.songs[0]
    guildQueue.songs.splice(1, 0, currSong);
    if (guildQueue.songs.length > 21){
        var newSongs = guildQueue.songs.slice(0, 21);
        guildQueue.songs = newSongs
    }
    const requesterName = memberRequester.displayName
    const exampleEmbed = new MessageEmbed()
    .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
    .setDescription(currSong.name + " passed the vibe - will repeat")
    content = { embeds: [exampleEmbed] }
    await sendMessage(message, content)
}
client.player
    // Emitted when channel was empty.
    .on('channelEmpty',  (queue) =>{
        if (!queue) return
        const message =  queue.data?.queueInitMessage
        const exampleEmbed = new MessageEmbed()
        .setDescription(`Everyone left the Voice Channel. Adios!`)
        const content = { embeds: [exampleEmbed] }
        defaultGuildSetting(message.guild)
        sendMessage(message, content)    
    })
    // Emitted when a song was added to the queue.
    // song["requestedBy"] = memberRequester takes place after emitting
    // access will fail
    .on('songAdd',  (queue, song) =>{
        if (!queue || !song || song.isFirst) return
        const message =  queue.data?.queueInitMessage
        const exampleEmbed = new MessageEmbed()
        .setDescription(`Song ${song} was added to the queue.`)
        const content = { embeds: [exampleEmbed] }
        sendMessage(message, content)
        
    })
    // Emitted when a playlist was added to the queue.
    .on('playlistAdd',  (queue, playlist) =>{
        if (!queue || !playlist) return
        const message =  queue.data.queueInitMessage
        const exampleEmbed = new MessageEmbed()
        .setDescription(`Playlist ${playlist} with ${Math.min(playlist.songs.length, 21)} was added to the queue.`)
        const content = { embeds: [exampleEmbed] }
        sendMessage(message, content)
        
    })
    // Emitted when queue was destroyed.
    // destroy queue and any voiceConnection when it disconnects by any reason
    // to prevent memory leak
    .on('queueDestroyed',  (queue) =>{
        if (!queue) return
        queue.leave()
    })
    // Emitted when the queue had no more songs and not playing.    
    .on('queueEnd',  (queue) =>{
        if (!queue) return
        const message =  queue.data?.queueInitMessage
        const exampleEmbed = new MessageEmbed()
        .setDescription("Queue Ended")
        const content = { embeds: [exampleEmbed] }
        sendMessage(message, content)
    })
    // Emitted when a song changed.
    .on('songChanged', (queue, newSong, oldSong) =>  {
        if (!queue || !newSong) return
        const song  = newSong
        const memberRequester = song.requestedBy
        const requesterName = memberRequester.displayName
        const message =  queue.data?.queueInitMessage
        const exampleEmbed = new MessageEmbed()
        .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
        .setDescription(`Playing [${song.name}](${song.url})`)
        .setThumbnail(song.thumbnail)
        .setFooter({ text: `Duration: ${song.duration}`})
        const content = { embeds: [exampleEmbed] }
        sendMessage(message, content);
        
    })
    // Emitted when a first song in the queue started playing.
    .on('songFirst',  (queue, song) =>{
        if (!queue || !song) return
        const memberRequester = song.requestedBy
        const requesterName = memberRequester.displayName
        const message =  queue.data?.queueInitMessage
        const exampleEmbed = new MessageEmbed()
        .setAuthor({ name: requesterName, iconURL: memberRequester.displayAvatarURL({ dynamic: true })})
        .setDescription(`Playing [${song.name}](${song.url})`)
        .setThumbnail(song.thumbnail)
        .setFooter({ text: `Duration: ${song.duration}`})
        const content = { embeds: [exampleEmbed] }
        sendMessage(message, content);
        // song.seekTime is not accurate, always returns 0
        // set directly song's first property to be false instead when switching channel 
        song._setFirst(false)
    })
    // Emitted when someone disconnected the bot from the channel.
    // destroy queue and any voiceConnection when it disconnects by any reason
    // to prevent memory leak
    .on('clientDisconnect', (queue) =>{
        if (!queue) return
        const message =  queue.data?.queueInitMessage
        const exampleEmbed = new MessageEmbed()
        .setDescription("I got kicked, stomped, jumped.")
        const content = { embeds: [exampleEmbed]}
        sendMessage(message, content)
        queue.leave()
    })
    // Emitted when deafenOnJoin is true and the bot was undeafened
    .on('clientUndeafen', (queue) =>{            
        if (!queue) return
        const message =  queue.data?.queueInitMessage
        const exampleEmbed = new MessageEmbed()
        .setDescription("I've removed the bucket over my head.")
        const content = { embeds: [exampleEmbed] }
        sendMessage(message, content)
        
    })
    // Emitted when there was an error in runtime
    .on('error', (error, queue) => {
        if (!queue) return
        console.log(`Error: ${error} in ${queue.guild?.name}`);

    });
function wordTimeToSeconds(timeString) {
    if (!timeString){
        return null
    }
    const numberMap ={
        "zero" : "0",
        "one" : "1",
        "two" : "2",
        "three" : "3",
        "four" : "4",
        "five" : "5",
        "six" : "6",
        "seven" : "7",
        "eight" : "8",
        "nine" : "9",
        "ten" : "10"
    }
    var timeStringToken = timeString.split(" ")
    for (let i = 0; i < timeStringToken.length; i++){
        if (timeStringToken[i] in numberMap){
            timeStringToken[i] = numberMap.timeStringToken[i]
        }
    }
    timeString = timeStringToken.join(" ")

    const matches = timeString.match(/(\d+)\s*hours?|(\d+)\s*minutes?|(\d+)\s*seconds?/g);
    if (!matches) return null;
    let hours = 0, minutes = 0, seconds = 0;
    for (const match of matches) {
        const parts = match.split(' ');
        const value = parseInt(parts[0], 10);
        if (parts[1] === 'hour' || parts[1] === 'hours') {
        hours += Math.min(value, 24);
        } else if (parts[1] === 'minute' || parts[1] === 'minutes') {
        minutes += Math.min(value, 1440);
        } else if (parts[1] === 'second' || parts[1] === 'seconds') {
        seconds += Math.min(value, 84000);
        }
    }
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    return (isNaN(totalSeconds)) ? null : Math.min(totalSeconds, 84000)
}
function colonTimeToSeconds(timeString) {
    if (!timeString){
        return null
    }
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    const totalSeconds = Math.min(hours, 24) * 3600 + Math.min(minutes, 1440) * 60 + Math.min(seconds, 84000);
    return (isNaN(totalSeconds)) ? null : Math.min(totalSeconds, 84000)
}
function secondsToReadableTime(seconds){
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    var formattedTime = ""
    if (hours && !minutes && !remainingSeconds){
        formattedTime = hours.toString() + " hours"
        return formattedTime
    }
    if (!hours && minutes && !remainingSeconds){
        formattedTime = minutes.toString() + " minutes"
        return formattedTime
    }
    if (!hours && !minutes && remainingSeconds){
        formattedTime = remainingSeconds.toString() + " seconds"
        return formattedTime
    }
    if (hours){
    formattedTime += `${String(hours).padStart(2, '0')}:`
    }
    formattedTime += `${String(minutes).padStart(2, '0')}:`+
    `${String(remainingSeconds).padStart(2, '0')}`;
    return formattedTime;
}
function getFirstNumberFromString(inputString) {
    if (!inputString){
        return null
    }
    const match = inputString.match(/\d+/);
    if (match) {
        return parseInt(match[0], 10); 
    }
    return null; 
}
client.login(process.env.DISCORD_TOKEN2);
