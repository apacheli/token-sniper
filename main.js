const Eris = require("eris");
// node-fetch typings suck
const { default: fetch, Headers } = require("node-fetch");

const client = Eris(process.env["DISCORD_TOKEN"], {
  intents: ["guildMessages"],
  messageLimit: 0,
});

// Eris does not have a native way of setting identify presence. YIKES
client.presence.game = {
  name: "the chat to invalidate tokens",
  type: 3,
};

// https://i.imgur.com/7WdehGn.png
const TOKEN_REGEXP =
  /(mfa\.)?(?<id>[A-Za-z0-9-_]{23,28})\.(?<timestamp>[A-Za-z0-9-_]{6,7})\.(?<hmac>[A-Za-z0-9-_]{27})/g;

const DISCORD_EPOCH = 1420070400000n; // 2015
const TOKEN_EPOCH = 1293840000000n; // 2011

const validateToken = (token) => {
  try {
    const id = BigInt(Buffer.from(token.id, "base64").toString());
    const idTimestamp = (id >> 22n) + DISCORD_EPOCH;
    const tokenTimestamp =
      BigInt(Buffer.from(token.timestamp, "base64")) * 1000n + TOKEN_EPOCH;

    return idTimestamp > DISCORD_EPOCH && idTimestamp < Date.now() &&
      tokenTimestamp > TOKEN_EPOCH && tokenTimestamp < Date.now();
  } catch {
    return false;
  }
};

client.on("ready", () => {
  console.log("connected");
});

client.on("messageCreate", async (message) => {
  if (
    message.guildID !== "812458966357377067" &&
    message.guildID !== "588077893205229793"
  ) {
    return;
  }

  const matches = message.content.matchAll(TOKEN_REGEXP);
  const validTokens = [];

  for (const match of matches) {
    if (validateToken(match.groups)) {
      validTokens.push(match[0]);
    }
  }

  if (validTokens.length < 1) {
    return;
  }

  const headers = new Headers();
  headers.set("Accept", "application/vnd.github.v3+json");
  headers.set("Authorization", `token ${process.env["GITHUB_TOKEN"]}`);

  // https://docs.github.com/en/rest/reference/gists#create-a-gist
  const response = await fetch("https://api.github.com/gists", {
    body: JSON.stringify({
      description:
        `https://canary.discord.com/channels/${message.guildID}/${message.channel.id}/${message.id}`,
      files: {
        "tokens.txt": {
          content: validTokens.join("\n"),
        },
      },
      public: true,
    }),
    headers,
    method: "POST",
  });

  if (!response.ok) {
    console.log("Failed to upload tokens to Gist.", response);
    return;
  }

  const data = await response.json();

  await client.createMessage(message.channel.id, {
    allowedMentions: {
      repliedUser: true,
    },
    messageReference: {
      messageID: message.id,
    },
    content:
      `You posted tokens. I have uploaded them to Gist in an attempt to invalidate them.\n\n<${data.html_url}>`,
  });
});

client.on("error", (error, id) => console.log(error, id));

client.connect();
