const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const SpotifyWebApi = require('spotify-web-api-node');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const prefix = '!'; // Change this to your preferred prefix

// Spotify API setup
const spotifyApi = new SpotifyWebApi({
  clientId: '3ce16d267b59460f9adc008a48271a86',
  clientSecret: '35c1000523524049b4148e7111bc88c8',
});

// Authenticate with Spotify
spotifyApi.clientCredentialsGrant().then(
  (data) => {
    spotifyApi.setAccessToken(data.body['access_token']);
  },
  (err) => {
    console.error('Error authenticating with Spotify:', err);
  }
);

// Global variables for player and queue
let player;
let queue = [];
let isLooping = false;

// Function to search YouTube
async function searchYouTube(query) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const response = await ytdl.getInfo(searchUrl);
  return response.videoDetails.video_url;
}

// Function to create control buttons
function createControlButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('play_pause')
      .setLabel('⏯️ Play/Pause')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('skip')
      .setLabel('⏭️ Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('loop')
      .setLabel('🔁 Loop')
      .setStyle(isLooping ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('stop')
      .setLabel('⏹️ Stop')
      .setStyle(ButtonStyle.Danger)
  );
}

// Function to play music
async function playMusic(message, url) {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply('You need to be in a voice channel to play music!');
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });

  player = createAudioPlayer();
  const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
  const resource = createAudioResource(stream);

  player.play(resource);
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    if (!isLooping && queue.length > 0) {
      const nextSong = queue.shift();
      playMusic(message, nextSong);
    } else if (!isLooping) {
      connection.destroy();
    }
  });

  player.on('error', (error) => {
    console.error('Error:', error);
    connection.destroy();
  });

  // Send control buttons
  const controlButtons = createControlButtons();
  message.reply({ content: `Now playing: ${url}`, components: [controlButtons] });
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(prefix) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'play') {
    const query = args.join(' ');

    if (!query) {
      return message.reply('Please provide a song name, Spotify link, or YouTube link.');
    }

    let url;

    // Check if it's a Spotify link
    if (query.includes('spotify.com')) {
      const trackId = query.split('/').pop().split('?')[0];
      const trackInfo = await spotifyApi.getTrack(trackId);
      const searchQuery = `${trackInfo.body.name} ${trackInfo.body.artists[0].name}`;
      url = await searchYouTube(searchQuery);
    }
    // Check if it's a YouTube link
    else if (ytdl.validateURL(query)) {
      url = query;
    }
    // Search YouTube for the query
    else {
      url = await searchYouTube(query);
    }

    if (!url) {
      return message.reply('Could not find the requested song.');
    }

    queue.push(url);
    if (!player || player.state.status === AudioPlayerStatus.Idle) {
      playMusic(message, queue.shift());
    } else {
      message.reply('Added to queue.');
    }
  }

  if (command === 'stop') {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('You need to be in a voice channel to stop music!');
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    connection.destroy();
    queue = [];
    message.reply('Stopped playing music.');
  }
});

// Handle button interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId } = interaction;

  switch (customId) {
    case 'play_pause':
      if (player.state.status === AudioPlayerStatus.Playing) {
        player.pause();
        interaction.reply('⏸️ Paused the music.');
      } else {
        player.unpause();
        interaction.reply('▶️ Resumed the music.');
      }
      break;

    case 'skip':
      if (queue.length > 0) {
        const nextSong = queue.shift();
        playMusic(interaction, nextSong);
        interaction.reply('⏭️ Skipped to the next song.');
      } else {
        interaction.reply('No more songs in the queue.');
      }
      break;

    case 'loop':
      isLooping = !isLooping;
      interaction.reply(isLooping ? '🔁 Loop enabled.' : '🔁 Loop disabled.');
      break;

    case 'stop':
      player.stop();
      queue = [];
      interaction.reply('⏹️ Stopped the music.');
      break;
  }
});

client.login('yoooo'); // Replace with your bot's token
