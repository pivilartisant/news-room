const { App } = require('@slack/bolt');

// In-memory storage for extracted data
let extractedData = [];
let privateChannelData = [];
let botChannels = [];

// Slack bot setup (only if environment variables are provided)
let slackApp = null;
if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
  slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true // Using socket mode for easier development
  });
}

// Slack event handlers (only if Slack app is initialized)
if (slackApp) {
  slackApp.event('message', async ({ event, client }) => {
    try {
      // Only process messages from channels (not DMs) and not from bots
      if (event.channel_type === 'channel' && !event.bot_id && event.text) {
        const messageData = {
          id: Date.now(),
          timestamp: new Date(event.ts * 1000).toISOString(),
          user: event.user,
          channel: event.channel,
          text: event.text
        };
        
        // Store message data
        extractedData.unshift(messageData); // Add to beginning
        
        // Keep only last 20 entries
        if (extractedData.length > 20) {
          extractedData = extractedData.slice(0, 20);
        }
        
        console.log('Received message:', messageData);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
}

// Function to get chat history from a channel
async function getChannelHistory(channelId, limit = 3) {
  if (!slackApp) return [];
  
  try {
    const result = await slackApp.client.conversations.history({
      channel: channelId,
      limit: limit
    });
    
    return result.messages;
  } catch (error) {
    console.error('Error fetching channel history:', error);
    return [];
  }
}

// Function to get bot's channels
async function getBotChannels() {
  if (!slackApp) return [];
  
  try {
    // Get list of conversations (channels) the bot is a member of
    const result = await slackApp.client.conversations.list({
      types: 'private_channel',
      exclude_archived: true
    });
    
    const channels = result.channels.filter(channel => channel.is_member);
    botChannels = channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      is_private: channel.is_private,
      num_members: channel.num_members || 0,
      purpose: channel.purpose?.value || '',
      updated: new Date().toISOString()
    }));
    
    return botChannels;
  } catch (error) {
    console.error('Error fetching bot channels:', error);
    return botChannels;
  }
}

// Function to get and integrate #happenings history
async function loadHappeningsHistory() {
  try {
    console.log('🔍 Loading #happenings channel history...');
    
    const happeningsChannelId = 'C05B6DBN802'; // Hardcoded #happenings channel ID
    
    const messages = await getChannelHistory(happeningsChannelId, 3); // Get more messages
    

    if (messages.length === 0) {
      console.log('📭 No messages found in #happenings');
      return;
    }
    
    console.log(`📋 Loaded ${messages.length} messages from #happenings`);
    
    // Convert happenings messages to same format as real-time messages
    const happeningsMessages = messages.map(message => ({
      id: `happenings-${message.ts}`,
      timestamp: new Date(message.ts * 1000).toISOString(),
      user: message.user,
      channel: happeningsChannelId,
      text: message.text
    }));
    
    // Remove old happenings messages from extractedData
    extractedData = extractedData.filter(msg => !msg.id.startsWith('happenings-'));
    
    // Add new happenings messages to the beginning
    extractedData = [...happeningsMessages.reverse(), ...extractedData];
    
    // Keep only last 50 total entries
    if (extractedData.length > 50) {
      extractedData = extractedData.slice(0, 50);
    }
    
    // Add happenings channel to botChannels if not already there
    const happeningsExists = botChannels.some(ch => ch.id === happeningsChannelId);
    if (!happeningsExists) {
      botChannels.unshift({
        id: happeningsChannelId,
        name: 'happenings',
        is_private: false,
        num_members: 0,
        purpose: 'Latest happenings and announcements',
        updated: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Error loading happenings history:', error);
  }
}

// Function to get and integrate #hackathons history
async function loadHackathonsHistory() {
  try {
    console.log('🔍 Loading #hackathons channel history...');
    
    const hackathonsChannelId = 'C0NP503L7'; // Hardcoded #hackathons channel ID
    
    const messages = await getChannelHistory(hackathonsChannelId, 3); // Get only last 2 messages
    
    if (messages.length === 0) {
      console.log('📭 No messages found in #hackathons');
      return;
    }
    
    console.log(`📋 Loaded ${messages.length} messages from #hackathons`);
    
    // Convert hackathons messages to same format as real-time messages
    const hackathonsMessages = messages.map(message => ({
      id: `hackathons-${message.ts}`,
      timestamp: new Date(message.ts * 1000).toISOString(),
      user: message.user,
      channel: hackathonsChannelId,
      text: message.text
    }));
    
    // Remove old hackathons messages from extractedData
    extractedData = extractedData.filter(msg => !msg.id.startsWith('hackathons-'));
    
    // Add new hackathons messages to the beginning
    extractedData = [...hackathonsMessages.reverse(), ...extractedData];
    
    // Keep only last 50 total entries
    if (extractedData.length > 50) {
      extractedData = extractedData.slice(0, 50);
    }
    
    // Add hackathons channel to botChannels if not already there
    const hackathonsExists = botChannels.some(ch => ch.id === hackathonsChannelId);
    if (!hackathonsExists) {
      botChannels.unshift({
        id: hackathonsChannelId,
        name: 'hackathons',
        is_private: false,
        num_members: 0,
        purpose: 'Hackathon announcements and updates',
        updated: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Error loading hackathons history:', error);
  }
}

// Function to get and integrate #ship history
async function loadShipHistory() {
  try {
    console.log('🔍 Loading #ship channel history...');
    
    const shipChannelId = 'C0M8PUPU6'; // Hardcoded #ship channel ID
    
    const messages = await getChannelHistory(shipChannelId, 3); // Get only last 1 message
    
    if (messages.length === 0) {
      console.log('📭 No messages found in #ship');
      return;
    }
    

    console.log(`📋 Loaded ${messages.length} message from #ship\n`);
    
    // Convert ship messages to same format as real-time messages
    const shipMessages = messages.map(message => ({
      id: `ship-${message.ts}`,
      timestamp: new Date(message.ts * 1000).toISOString(),
      user: message.user,
      channel: shipChannelId,
      text: message.text
    }));
    
    // Remove old ship messages from extractedData
    extractedData = extractedData.filter(msg => !msg.id.startsWith('ship-'));
    
    // Add new ship messages to the beginning
    extractedData = [...shipMessages.reverse(), ...extractedData];
  
    // Keep only last 50 total entries
    if (extractedData.length > 50) {
      extractedData = extractedData.slice(0, 50);
    }
    
    // Add ship channel to botChannels if not already there
    const shipExists = botChannels.some(ch => ch.id === shipChannelId);
    if (!shipExists) {
      botChannels.unshift({
        id: shipChannelId,
        name: 'ship',
        is_private: false,
        num_members: 0,
        purpose: 'Latest projects and creations shipped',
        updated: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Error loading ship history:', error);
  }
}

// Function to get and integrate #announcements history
async function loadAnnouncementsHistory() {
  try {
    console.log('🔍 Loading #announcements channel history...');
    
    const announcementsChannelId = 'C0266FRGT'; // Hardcoded #announcements channel ID
    
    const messages = await getChannelHistory(announcementsChannelId, 3); // Get last 3 messages
    
    if (messages.length === 0) {
      console.log('📭 No messages found in #announcements');
      return;
    }
    
    console.log(`📋 Loaded ${messages.length} messages from #announcements`);
    
    // Convert announcements messages to same format as real-time messages
    const announcementsMessages = messages.map(message => ({
      id: `announcements-${message.ts}`,
      timestamp: new Date(message.ts * 1000).toISOString(),
      user: message.user,
      channel: announcementsChannelId,
      text: message.text
    }));
    
    // Remove old announcements messages from extractedData
    extractedData = extractedData.filter(msg => !msg.id.startsWith('announcements-'));
    
    // Add new announcements messages to the beginning
    extractedData = [...announcementsMessages.reverse(), ...extractedData];
  
    // Keep only last 50 total entries
    if (extractedData.length > 50) {
      extractedData = extractedData.slice(0, 50);
    }
    
    // Add announcements channel to botChannels if not already there
    const announcementsExists = botChannels.some(ch => ch.id === announcementsChannelId);
    if (!announcementsExists) {
      botChannels.unshift({
        id: announcementsChannelId,
        name: 'announcements',
        is_private: false,
        num_members: 0,
        purpose: 'Important announcements and updates',
        updated: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Error loading announcements history:', error);
  }
}

// Function to load history from all private channels
async function loadPrivateChannelsHistory() {
  try {
    console.log('🔍 Loading private channels history...');
    
    // Get all channels the bot is in
    const allChannels = await getBotChannels();
    const privateChannels = allChannels.filter(channel => channel.is_private);
    
    if (privateChannels.length === 0) {
      console.log('📭 No private channels found');
      return;
    }
    
    console.log(`📋 Found ${privateChannels.length} private channels:`, privateChannels.map(ch => ch.name));
    
    // Load 2 messages from each private channel
    for (const channel of privateChannels) {
      try {
        const messages = await getChannelHistory(channel.id, 2);
        
        if (messages.length === 0) {
          console.log(`📭 No messages found in #${channel.name}`);
          continue;
        }
        
        console.log(`📋 Loaded ${messages.length} messages from private #${channel.name}`);
        
        // Convert messages to same format as real-time messages
        const privateMessages = messages.map(message => ({
          id: `private-${channel.name}-${message.ts}`,
          timestamp: new Date(message.ts * 1000).toISOString(),
          user: message.user,
          channel: channel.id,
          text: message.text
        }));
        
        // Remove old messages from this private channel
        privateChannelData = privateChannelData.filter(msg => !msg.id.startsWith(`private-${channel.name}-`));
        
        // Add new messages to the beginning
        privateChannelData = [...privateMessages.reverse(), ...privateChannelData];
        
      } catch (error) {
        console.error(`❌ Error loading history from private #${channel.name}:`, error);
      }
    }
    
    // Keep only last 50 entries for private channels
    if (privateChannelData.length > 50) {
      privateChannelData = privateChannelData.slice(0, 50);
    }
    
    console.log(`✅ Private channel messages: ${privateChannelData.length}`);
    
  } catch (error) {
    console.error('❌ Error loading private channels history:', error);
  }
}

// Function to start the Slack bot
async function startSlackBot() {
  if (slackApp) {
    try {
      await slackApp.start();
      console.log('Slack bot started in socket mode and ready to receive events');
      
      // Load channel histories after bot starts
      setTimeout(async () => {
        await loadHappeningsHistory();
        await loadHackathonsHistory();
        await loadShipHistory();
        await loadAnnouncementsHistory();
        await loadPrivateChannelsHistory();
      }, 2000); // Wait 2 seconds for bot to fully initialize
      
      // Refresh channel data every 10 minutes
      setInterval(async () => {
        await loadHappeningsHistory();
        await loadHackathonsHistory();
        await loadShipHistory();
        await loadAnnouncementsHistory();
        await loadPrivateChannelsHistory();
      }, 10 * 60 * 1000);
      
    } catch (error) {
      console.error('Error starting Slack bot:', error);
    }
  } else {
    console.log('Slack bot not initialized - set SLACK_BOT_TOKEN and SLACK_APP_TOKEN environment variables to enable');
  }
}

// Export functions for use in main app
module.exports = {
  startSlackBot,
  getBotChannels,
  getExtractedData: () => extractedData,
  getPrivateChannelData: () => privateChannelData,
  getAllData: () => [...extractedData, ...privateChannelData],
  isSlackBotInitialized: () => !!slackApp
};
