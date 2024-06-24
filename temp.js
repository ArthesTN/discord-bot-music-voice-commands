const { Client, Intents, Message} = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const play = require('yt-stream')
require("dotenv").config();
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.MESSAGE_CONTENT] });
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.content.startsWith('!play') && message.member?.voice?.channel) {
        const args = message.content.split(' ');
        const url = args[1];
            const channel = message.member.voice.channel;

            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: message.guild?.id,
                adapterCreator: message.guild?.voiceAdapterCreator,
            });
            let stream = await play.stream(url)
            let resource = createAudioResource(stream.stream
            )
            let player = createAudioPlayer()

            connection.subscribe(player);
            console.log(resource)
            player.play(resource);
            player.on(AudioPlayerStatus.Idle, () => connection.destroy());

            message.reply(`Now playing: ${url}`);
        } else {
            message.reply('Please provide a valid YouTube URL.');
        }
    
});

client.login(process.env.DISCORD_TOKEN1);
