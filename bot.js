const Discord = require('discord.js');
const fs = require('fs');
const cleverbot = require('cleverbot-free');
const colors = require('colors');

const typingSpeed = 4;
const debugTheme = { system: ['green'], warning: ['yellow'], error: ['red'], info: ['gray'] };
const authFilePath = "./auth.json";
const auth = require(authFilePath);
const client = new Discord.Client({
  partials: ['CHANNEL'],
  intents: [
    Discord.Intents.FLAGS.GUILDS,
    Discord.Intents.FLAGS.GUILD_MESSAGES,
    Discord.Intents.FLAGS.GUILD_MESSAGE_TYPING,
    Discord.Intents.FLAGS.DIRECT_MESSAGES,
    Discord.Intents.FLAGS.DIRECT_MESSAGE_TYPING
  ]
});

const debugFormatError = function(error) {
  if (typeof(error) === 'string') return error.error;
  const e = new Error();
  if (error.name !== undefined) e.name = error.name.error;
  e.message = error.message;
  return e;
};

const connect = function() {
  const retryWait = 10;
  console.log("Logging in".system);
  client.login(auth.token).then(() => {
    console.log("Logged in successfully".system);
    console.log();
  }).catch(error => {
    console.error("\t" + debugFormatError(error));
    console.log("Retrying connection in ".warning + retryWait + " seconds...".warning);
    console.log();
    setTimeout(connect, retryWait*1000);
  });
}

const onceReady = async function () {
  console.log("Client ready".system);
  console.log();
};

const replaceMentions = function(content) {
  return content.replaceAll("@​"+client.user.username, "Cleverbot");
};

const replaceUnknownEmojis = function(content) {
  content = content.replaceAll(/<:[\w\W][^:\s]+:\d+>/g, match => {
    match = match.replace("<:", "");
    match = match.replace(/:\d+>/g, "");
    match = match.replace("_", " ");
    return "*"+match+"*";
  });
  content = content.replaceAll(":", "*").replaceAll("_", " ");
  return content;
};

const sendErrorMessage = function(message, error) {
  const embed = {
    title: "Error",
    description: "I encountered an error while trying to respond. Please forward this to my developer.",
    color: 16711680,
    fields: [ { name: "Message", value: "``" + error + "``" } ]
  };
  console.log("Sending error message".system);
  message.reply({embeds: [embed]}).then(() => {
    console.log("Error message sent successfully".system);
    console.log();
  }).catch(error => {
    console.error("\t" + debugFormatError(error));
    console.log("Failed to send error message".warning);
    console.log();
  });
};

const context = {};
const maxContextLength = 50;

const addToContext = function(channel, str) {
  context[channel.id].push(str);
  if (context[channel.id].length > maxContextLength) context[channel.id].shift();
};

const generateContext = async function(channel) {
  context[channel.id] = [];
  let messages = await channel.messages.fetch({limit: maxContextLength});
  messages.each(message => {
    if (message.cleanContent === "") return;
    let input = message.cleanContent;
    if (message.mentions.has(client.user)) input = replaceMentions(input);
    input = replaceUnknownEmojis(input);
    context[channel.id].unshift(input);
  });
  return context[channel.id];
};

const thinking = {};

const stopThinking = function(channel) {
  thinking[channel.id] = false;
};

const startThinking = function(channel) {
  thinking[channel.id] = true;
};

const whitelistFilePath = "./whitelist.json";

const getWhitelist = function() {
  return JSON.parse(fs.readFileSync(whitelistFilePath));
};

const removeFromWhitelist = function(channel) {
  let channelID = channel.id;
  if (channelID === undefined) channelID = channel;
  let whitelist;
  if (getWhitelist().indexOf(channelID) !== -1) {
    whitelist = getWhitelist();
    whitelist.splice(whitelist.indexOf(channelID), 1);
    fs.writeFileSync(whitelistFilePath, JSON.stringify(whitelist));
    return true;
  }
  return false;
};

const onMessage = async function(message) {
  if (message.author.id === client.user.id || message.cleanContent === "" || message.cleanContent.substring(0,2) === "> " || thinking[message.channel.id] || getWhitelist().indexOf(message.channel.id) === -1) return;
  console.log("Received new message".system);
  let input = message.cleanContent;
  if (message.mentions.has(client.user)) input = replaceMentions(input);
  input = replaceUnknownEmojis(input);
  if (!context[message.channel.id]) await generateContext(message.channel);
  else addToContext(message.channel, input);
  startThinking(message.channel);
  cleverbot(input, context[message.channel.id]).then(response => {
    if (response === "") {
      const error = new Error();
      error.name = "Invalid Cleverbot Response";
      error.message = "Response is an empty string";
      throw error;
    }
    console.log("Generated response successfully".system);
    const timeTypeSec = response.length / typingSpeed;
    message.channel.sendTyping();
    setTimeout(function() {
      message.channel.send(response).then(() => {
        console.log("Sent message successfully".system);
        console.log();
      }).catch(error => {
        console.error("\t" + debugFormatError(error));
        console.error("Failed to send message".warning);
      });
      addToContext(message.channel, response);
      stopThinking(message.channel);
    }, timeTypeSec * 1000);
  }).catch(error => {
    context[message.channel.id].pop();
    stopThinking(message.channel);
    console.error("\t" + debugFormatError(error));
    console.error("Failed to generate response".warning);
    sendErrorMessage(message, error);
  });
};

colors.setTheme(debugTheme);
client.on('error', error => console.error("\t", debugFormatError(error)));
client.once('ready', onceReady);
client.on('messageCreate', message => onMessage(message));
connect();
