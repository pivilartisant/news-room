const { App } = require('@slack/bolt');

// Helper function to add delays between API calls
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// In-memory storage for extracted data
let extractedData = [];
let botChannels = [];
let loadingStatus = {
  isLoading: false,
  currentChannel: null,
  completed: 0,
  total: 0,
  message: 'Ready'
};

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

// Function to get chat history from a channel with rate limit handling
async function getChannelHistory(channelId, limit = 3, retries = 3) {
  if (!slackApp) return [];
  
  try {
    const result = await slackApp.client.conversations.history({
      channel: channelId,
      limit: limit
    });
    
    return result.messages;
  } catch (error) {
    // Handle rate limiting
    if (error.code === 'rate_limited' && retries > 0) {
      const retryAfter = error.retryAfter || 60; // Default to 60 seconds
      console.log(`Rate limited, waiting ${retryAfter} seconds before retry...`);
      await sleep(retryAfter * 1000);
      return getChannelHistory(channelId, limit, retries - 1);
    }
    
    console.error(`Error fetching channel history for ${channelId}:`, error.message);
    return [];
  }
}

// Function to get bot's channels
async function getBotChannels() {
  if (!slackApp) return [];
  
  try {
    // Get list of public channels the bot is a member of
    const result = await slackApp.client.conversations.list({
      types: 'public_channel',
      exclude_archived: true
    });
    
    const channels = result.channels.filter(channel => channel.is_member);
    botChannels = channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      is_private: false,
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

// Channel configurations
const MONITORED_CHANNELS = {
  happenings: {
    id: 'C05B6DBN802',
    name: 'happenings',
    purpose: 'Latest happenings and announcements',
    messageLimit: 2
  },
  hackathons: {
    id: 'C0NP503L7',
    name: 'hackathons',
    purpose: 'Hackathon announcements and updates',
    messageLimit: 2
  },
  ship: {
    id: 'C0M8PUPU6',
    name: 'ship',
    purpose: 'Latest projects and creations shipped',
    messageLimit: 5
  },
  announcements: {
    id: 'C0266FRGT',
    name: 'announcements',
    purpose: 'Important announcements and updates',
    messageLimit: 4
  }
};

// Generic function to load channel history
async function loadChannelHistory(channelKey) {
  const channel = MONITORED_CHANNELS[channelKey];
  if (!channel) {
    console.error(`❌ Unknown channel: ${channelKey}`);
    return;
  }

  try {
    // Update loading status
    loadingStatus.currentChannel = channel.name;
    loadingStatus.message = `Loading #${channel.name}...`;
    
    console.log(`🔍 Loading #${channel.name} channel history...`);
    
    const messages = await getChannelHistory(channel.id, channel.messageLimit);
    
    if (messages.length === 0) {
      console.log(`📭 No messages found in #${channel.name}`);
      return;
    }
    
    console.log(`📋 Loaded ${messages.length} message${messages.length > 1 ? 's' : ''} from #${channel.name}`);
    
    // Convert messages to standard format
    const formattedMessages = messages.map(message => ({
      id: `${channel.name}-${message.ts}`,
      timestamp: new Date(message.ts * 1000).toISOString(),
      user: message.user,
      channel: channel.id,
      text: message.text
    }));
    
    // Remove old messages from this channel
    extractedData = extractedData.filter(msg => !String(msg.id).startsWith(`${channel.name}-`));
    
    // Add new messages to the beginning
    extractedData = [...formattedMessages.reverse(), ...extractedData];
    
    // Keep only last 50 total entries
    if (extractedData.length > 50) {
      extractedData = extractedData.slice(0, 50);
    }
    
    // Add channel to botChannels if not already there
    const channelExists = botChannels.some(ch => ch.id === channel.id);
    if (!channelExists) {
      botChannels.unshift({
        id: channel.id,
        name: channel.name,
        is_private: false,
        num_members: 0,
        purpose: channel.purpose,
        updated: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error(`❌ Error loading ${channel.name} history:`, error);
  }
}

// Convenience functions for backward compatibility
const loadHappeningsHistory = () => loadChannelHistory('happenings');
const loadHackathonsHistory = () => loadChannelHistory('hackathons');
const loadShipHistory = () => loadChannelHistory('ship');
const loadAnnouncementsHistory = () => loadChannelHistory('announcements');

// Function to load multiple channels with rate limiting
async function loadMultipleChannels(channelKeys, delayMs = 15000) {
  // Initialize loading status
  loadingStatus.isLoading = true;
  loadingStatus.completed = 0;
  loadingStatus.total = channelKeys.length;
  loadingStatus.message = 'Starting channel loading...';
  
  console.log(`🚀 Loading ${channelKeys.length} channels...`);
  
  for (const [index, channelKey] of channelKeys.entries()) {
    await loadChannelHistory(channelKey);
    
    // Update progress
    loadingStatus.completed = index + 1;
    
    // Add delay between channels (except for the last one)
    if (index < channelKeys.length - 1) {
      loadingStatus.message = `Waiting before loading next channel... (${index + 1}/${channelKeys.length} completed)`;
      console.log(`⏳ Waiting ${delayMs/1000}s before loading next channel... (${index + 1}/${channelKeys.length} completed)`);
      await sleep(delayMs);
    }
  }
  
  // Mark as completed
  loadingStatus.isLoading = false;
  loadingStatus.currentChannel = null;
  loadingStatus.message = 'All channels loaded successfully!';
  
  console.log(`✅ All ${channelKeys.length} channels loaded successfully!`);
}



// Function to start the Slack bot
async function startSlackBot() {
  if (slackApp) {
    try {
      await slackApp.start();
      console.log('Slack bot started in socket mode and ready to receive events');
      
      // Load all channels on startup using batch processing
      setTimeout(async () => {
        console.log('🔄 Initializing channel data...');
        await loadMultipleChannels(['happenings', 'announcements', 'ship', 'hackathons'], 15000);
        console.log('🎉 Dashboard is ready!');
      }, 2000); // Wait 2 seconds for bot to fully initialize
      
      // Refresh critical channels every 2 hours
      setInterval(async () => {
        await loadMultipleChannels(['happenings', 'announcements', 'ship', 'hackathons'], 30000);
      }, 2 * 60 * 60 * 1000);
      
    } catch (error) {
      console.error('Error starting Slack bot:', error);
    }
  } else {
    console.log('Slack bot not initialized - set SLACK_BOT_TOKEN and SLACK_APP_TOKEN environment variables to enable');
  }
}

// Function to load all monitored channels
async function loadAllChannels() {
  const channelKeys = Object.keys(MONITORED_CHANNELS);
  await loadMultipleChannels(channelKeys, 15000);
}

// Export functions for use in main app
module.exports = {
  startSlackBot,
  getBotChannels,
  getExtractedData: () => extractedData,
  getLoadingStatus: () => loadingStatus,
  isSlackBotInitialized: () => !!slackApp,
  loadChannelHistory,
  loadAllChannels,
  loadHappeningsHistory,
  loadHackathonsHistory,
  loadShipHistory,
  loadAnnouncementsHistory
};
