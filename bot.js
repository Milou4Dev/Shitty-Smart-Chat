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
const debugFormatError = (error) => {
  if (typeof error === 'string') return error.error;
  const e = new Error();
  if (error.name !== undefined) e.name = error.name.error;
  e.message = error.message;
  return e;
};
const connect = () => {
  const retryWait = 10;
  console.log("Logging in".system);
  client.login(auth.token).then(() => {
    console.log("Logged in successfully".system);
    console.log();
  }).catch(error => {
    console.error("\t" + debugFormatError(error));
    console.log(`Retrying connection in ${retryWait} seconds...`.warning);
    console.log();
    setTimeout(connect, retryWait * 1000);
  });
};
const onceReady = async () => {
  console.log("Client ready".system);
  console.log();
};
const replaceMentions = (content) => content.replaceAll(`@​${client.user.username}`, "Cleverbot");
const replaceUnknownEmojis = (content) => {
  content = content.replaceAll(/<:[\w\W][^:\s]+:\d+>/g, match => {
    match = match.replace("<:", "").replace(/:\d+>/g, "").replace("_", " ");
    return `*${match}*`;
  });
  return content.replaceAll(":", "*").replaceAll("_", " ");
};
const sendErrorMessage = (message, error) => {
  const embed = {
    title: "Error",
    description: "I encountered an error while trying to respond. Please forward this to my developer.",
    color: 16711680,
    fields: [{ name: "Message", value: `\`\`${error}\`\`` }]
  };
  console.log("Sending error message".system);
  message.reply({ embeds: [embed] }).then(() => {
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
const addToContext = (channel, str) => {
  context[channel.id].push(str);
  if (context[channel.id].length > maxContextLength) context[channel.id].shift();
};
const generateContext = async (channel) => {
  context[channel.id] = [];
  const messages = await channel.messages.fetch({ limit: maxContextLength });
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
const stopThinking = (channel) => thinking[channel.id] = false;
const startThinking = (channel) => thinking[channel.id] = true;
const whitelistFilePath = "./whitelist.json";
const getWhitelist = () => JSON.parse(fs.readFileSync(whitelistFilePath));
const removeFromWhitelist = (channel) => {
  const channelID = channel.id || channel;
  const whitelist = getWhitelist();
  const index = whitelist.indexOf(channelID);
  if (index !== -1) {
    whitelist.splice(index, 1);
    fs.writeFileSync(whitelistFilePath, JSON.stringify(whitelist));
    return true;
  }
  return false;
};
const onMessage = async (message) => {
  if (
    message.author.id === client.user.id ||
    message.cleanContent === "" ||
    message.cleanContent.startsWith("> ") ||
    thinking[message.channel.id] ||
    !getWhitelist().includes(message.channel.id)
  ) return;
  console.log("Received new message".system);
  let input = message.cleanContent;
  if (message.mentions.has(client.user)) input = replaceMentions(input);
  input = replaceUnknownEmojis(input);
  if (!context[message.channel.id]) await generateContext(message.channel);
  else addToContext(message.channel, input);
  startThinking(message.channel);
  try {
    const response = await cleverbot(input, context[message.channel.id]);
    if (response === "") {
      const error = new Error("Invalid Cleverbot Response");
      error.message = "Response is an empty string";
      throw error;
    }
    console.log("Generated response successfully".system);
    const timeTypeSec = response.length / typingSpeed;
    message.channel.sendTyping();
    setTimeout(() => {
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
  } catch (error) {
    context[message.channel.id].pop();
    stopThinking(message.channel);
    console.error("\t" + debugFormatError(error));
    console.error("Failed to generate response".warning);
    sendErrorMessage(message, error);
  }
};
colors.setTheme(debugTheme);
client.on('error', error => console.error("\t", debugFormatError(error)));
client.once('ready', onceReady);
client.on('messageCreate', onMessage);
connect();
