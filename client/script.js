function updateTimestamp() {
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('timestamp').textContent = `Last Updated: ${timestamp}`;
}

async function loadEvents() {
    const eventsListDiv = document.getElementById('events-list');
    
    try {
        const response = await fetch('/api/events-api');
        const events = await response.json();
        
        updateTimestamp();
        
        if (events.length === 0) {
            eventsListDiv.innerHTML = '<p>No upcoming events found.</p>';
            return;
        }
        
        eventsListDiv.innerHTML = events.map(event => `
            <div class="event">
                <h3>${event.title || 'Untitled Event'}</h3>
                <p><strong>Date:</strong> ${event.start ? new Date(event.start).toLocaleDateString() : 'TBD'}</p>
                <p><strong>Location:</strong> ${event.location || 'Online'}</p>
                ${event.description ? `<p>${event.description}</p>` : ''}
                ${event.slug ? `<p><strong>Details:</strong> <a href="https://events.hackclub.com/${event.slug}/" target="_blank">View Event</a></p>` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading events:', error);
        eventsListDiv.innerHTML = '<div class="error">❌ Error loading events. Please try again.</div>';
        updateTimestamp();
    }
}

async function loadHackathons() {
    const hackathonsListDiv = document.getElementById('hackathons-list');
    
    try {
        const response = await fetch('/api/hackathons-api');
        const hackathons = await response.json();
        
        updateTimestamp();
        
        if (hackathons.length === 0) {
            hackathonsListDiv.innerHTML = '<p>No upcoming hackathons found.</p>';
            return;
        }
        
        // Sort hackathons by start date
        hackathons.sort((a, b) => {
            const dateA = a.start ? new Date(a.start) : new Date('9999-12-31');
            const dateB = b.start ? new Date(b.start) : new Date('9999-12-31');
            return dateA - dateB;
        });
        
        hackathonsListDiv.innerHTML = hackathons.map(hackathon => {
            let location = 'TBD';
            
            if (hackathon.virtual === true) {
                location = 'Online';
            } else {
                // Compose address from city, state, country
                const addressParts = [];
                if (hackathon.city) addressParts.push(hackathon.city);
                if (hackathon.state) addressParts.push(hackathon.state);
                if (hackathon.country) addressParts.push(hackathon.country);
                
                if (addressParts.length > 0) {
                    location = addressParts.join(', ');
                }
            }
            
            return `
                <div class="event">
                    <h3>${hackathon.name || 'Untitled Hackathon'}</h3>
                    <p><strong>Date:</strong> ${hackathon.start ? new Date(hackathon.start).toLocaleDateString() : 'TBD'}</p>
                    <p><strong>Location:</strong> ${location}</p>
                    ${hackathon.description ? `<p>${hackathon.description}</p>` : ''}
                    ${hackathon.website ? `<p><strong>Website:</strong> <a href="${hackathon.website}" target="_blank">View Details</a></p>` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading hackathons:', error);
        hackathonsListDiv.innerHTML = '<div class="error">❌ Error loading hackathons. Please try again.</div>';
        updateTimestamp();
    }
}

let selectedChannel = 'all';
let allSlackData = [];
let channelNames = {};

// Enhanced Slack message parser with support for various formatting
function parseSlackMessage(text) {
    if (!text) return text;
    
    return text
        // Handle line breaks
        .replace(/\n/g, '<br>')
        // Handle bold text
        .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
        // Handle italic text
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        // Handle code blocks
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Handle bullet points and wrap in ul
        .replace(/^• (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        // Handle channel mentions with clickable links
        .replace(/<#([^|>]+)\|([^>]+)>/g, '<a href="https://app.slack.com/client/T0266FRGM/$1?cdn_fallback=2" target="_blank" class="channel-mention">#$2</a>')
        // Handle channel mentions without display name (try to map to known channel names)
        .replace(/<#([^|>]+)>/g, (match, channelId) => {
            const displayName = getChannelDisplayName(channelId);
            return `<a href="https://app.slack.com/client/T0266FRGM/${channelId}?cdn_fallback=2" target="_blank" class="channel-mention">#${displayName}</a>`;
        })
        // Handle user mentions with clickable links
        .replace(/<@([^>]+)>/g, '<a href="https://app.slack.com/client/T0266FRGM/user/$1" target="_blank" class="user-mention">@$1</a>')
        // Handle emoji codes (basic implementation)
        .replace(/:([a-z0-9_-]+):/g, '<span class="emoji" title=":$1:">$1</span>')
        // Handle Slack links: <https://example.com> or <https://example.com|Link Text>
        .replace(/<(https?:\/\/[^|>]+)(\|([^>]+))?>/g, (match, url, pipe, linkText) => {
            const displayText = linkText || url;
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${displayText}</a>`;
        });
}

// Get message type based on channel
function getMessageType(message) {
    if (message.channel === 'C05B6DBN802') return 'happenings';
    if (message.channel === 'C0NP503L7') return 'hackathons';
    if (message.channel === 'C0M8PUPU6') return 'ship';
    if (message.channel === 'C0266FRGT') return 'announcements';
    return 'default';
}

// Format timestamp in a more readable way
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));
        return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
        return `${diffInHours}h ago`;
    } else {
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d ago`;
    }
}

// Get channel display name for channel ID
function getChannelDisplayName(channelId) {
    // First check if we have it in our loaded channelNames
    if (channelNames[channelId]) {
        return channelNames[channelId];
    }
    
    // Known channels with their display names
    const knownChannels = {
        'C05B6DBN802': 'happenings',
        'C0NP503L7': 'hackathons',
        'C0M8PUPU6': 'ship',
        'C0266FRGT': 'announcements',
        'C08SPN75J4E': 'showcase',
        'C07G7LVA9PY': 'personal-blog',
        'C087B5QM9BP': 'personal-space',
        'C07MYBDLBGU': 'personal-updates',
        'C0956A8CL86': 'timeless-chat',
        'C015M4L9AHW': 'summer-of-making',
        'C090JKDJYN8': 'summer-of-making-support',
        'C08Q1H6D79B': 'highway',
        'C06T17NQB0B': 'athena',
        'C08N0R86DMJ': 'the-hacker-zephyr',
        'C03QSGGCJN7': 'hackathon-planning',
        'C01D7AHKMPF': 'community-teams',
        'C02UN35M7LG': 'ysws-console',
        'C093ALFAW8K': 'rewind',
        'C0931T5SEH4': 'jumpstart'
    };
    
    return knownChannels[channelId] || channelId;
}

async function loadSlackData() {
    const slackListDiv = document.getElementById('slack-list');
    const refreshBtn = document.querySelector('.slack-container .refresh-btn');
    
    // Show loading state
    slackListDiv.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <div class="loading-text loading-dots">Loading Slack messages</div>
        </div>
    `;
    refreshBtn.classList.add('loading');
    
    try {
        console.info('🔗 Loading Slack data');
        const response = await fetch('/api/slack-data');
        allSlackData = await response.json();
        
        // Ensure we have channel names, if not load them
        if (Object.keys(channelNames).length === 0) {
            await loadChannels();
        }
        
        displayFilteredMessages();
    } catch (error) {
        console.error('Error loading Slack data:', error);
        slackListDiv.innerHTML = '<div class="error">❌ Error loading Slack data. Please try again.</div>';
    } finally {
        refreshBtn.classList.remove('loading');
    }
}

function displayFilteredMessages() {
    const slackListDiv = document.getElementById('slack-list');
    
    let filteredData = allSlackData;
    if (selectedChannel !== 'all') {
        filteredData = allSlackData.filter(message => message.channel === selectedChannel);
    }
    
    // Sort messages by timestamp (most recent first)
    filteredData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (filteredData.length === 0) {
        slackListDiv.innerHTML = selectedChannel === 'all' ? 
            '<p>No Slack activity found.</p>' : 
            '<p>No messages in selected channel.</p>';
        return;
    }
    
    slackListDiv.innerHTML = filteredData.map(message => {
        const channelName = channelNames[message.channel] || message.channel;
        const displayChannel = channelName.startsWith('#') ? channelName : `#${channelName}`;
        const messageType = getMessageType(message);
        const parsedText = parseSlackMessage(message.text);
        
        return renderMessage(message, messageType, displayChannel, parsedText);
    }).join('');
}

// Render message based on type
function renderMessage(message, messageType, displayChannel, parsedText) {
    const timestamp = formatTimestamp(message.timestamp);
    const messageId = `msg-${message.id}`;
    const isLongMessage = message.text.length > 500;
    
    const baseMessage = `
        <div class="slack-message ${messageType}" id="${messageId}">
            <div class="message-header">
                <span class="channel-badge ${messageType}">${getChannelIcon(messageType)} ${displayChannel}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="message-content ${isLongMessage ? 'expandable' : ''}">
                ${renderMessageContent(message, messageType, parsedText, isLongMessage)}
            </div>
            <div class="message-actions">
                ${isLongMessage ? `<button class="expand-btn" onclick="toggleExpand('${messageId}')">Read More</button>` : ''}
                <a href="https://hackclub.slack.com/archives/${message.channel}/p${message.id.split('-')[1]?.replace('.', '')}" target="_blank" class="view-slack">View in Slack</a>
            </div>
        </div>
    `;
    
    return baseMessage;
}

// Get channel icon based on message type
function getChannelIcon(messageType) {
    switch(messageType) {
        case 'happenings': return '📰';
        case 'hackathons': return '🏆';
        case 'ship': return '🚢';
        case 'announcements': return '📢';
        default: return '💬';
    }
}

// Render message content based on type
function renderMessageContent(message, messageType, parsedText, isLongMessage) {
    switch(messageType) {
        case 'happenings':
            return renderHappeningsContent(parsedText, isLongMessage);
        case 'ship':
            return renderShipContent(parsedText, isLongMessage);
        default:
            return renderDefaultContent(parsedText, isLongMessage);
    }
}

// Specialized rendering for happenings messages
function renderHappeningsContent(parsedText, isLongMessage) {
    if (isLongMessage) {
        const sections = parsedText.split('<br><br>');
        const previewSection = sections[0] || parsedText.substring(0, 300);
        const fullContent = parsedText;
        
        return `
            <div class="happenings-content">
                <div class="message-preview">
                    ${previewSection}${sections.length > 1 ? '<br><br>...' : ''}
                </div>
                <div class="message-full" style="display: none;">
                    ${fullContent}
                </div>
            </div>
        `;
    } else {
        return `<div class="happenings-content">${parsedText}</div>`;
    }
}

// Specialized rendering for ship messages
function renderShipContent(parsedText, isLongMessage) {
    if (isLongMessage) {
        const preview = parsedText.substring(0, 200);
        return `
            <div class="ship-content">
                <div class="message-preview">
                    ${preview}...
                </div>
                <div class="message-full" style="display: none;">
                    ${parsedText}
                </div>
            </div>
        `;
    } else {
        return `<div class="ship-content">${parsedText}</div>`;
    }
}

// Default rendering for other messages
function renderDefaultContent(parsedText, isLongMessage) {
    if (isLongMessage) {
        const preview = parsedText.substring(0, 300);
        return `
            <div class="default-content">
                <div class="message-preview">
                    ${preview}...
                </div>
                <div class="message-full" style="display: none;">
                    ${parsedText}
                </div>
            </div>
        `;
    } else {
        return `<div class="default-content">${parsedText}</div>`;
    }
}

// Toggle expand/collapse functionality
function toggleExpand(messageId) {
    const messageElement = document.getElementById(messageId);
    const previewElement = messageElement.querySelector('.message-preview');
    const fullElement = messageElement.querySelector('.message-full');
    const expandBtn = messageElement.querySelector('.expand-btn');
    
    if (fullElement.style.display === 'none') {
        previewElement.style.display = 'none';
        fullElement.style.display = 'block';
        expandBtn.textContent = 'Read Less';
    } else {
        previewElement.style.display = 'block';
        fullElement.style.display = 'none';
        expandBtn.textContent = 'Read More';
    }
}

async function loadChannels() {
    try {
        const response = await fetch('/api/slack-channels');
        const channels = await response.json();
        
        // Store channel names for display
        channelNames = {};
        
        // Always add channel name mappings
        channelNames['C05B6DBN802'] = 'happenings';
        channelNames['C0NP503L7'] = 'hackathons';
        channelNames['C0M8PUPU6'] = 'ship';
        channelNames['C0266FRGT'] = 'announcements';
        
        channels.forEach(channel => {
            channelNames[channel.id] = channel.name;
        });
        
        // Create filter buttons
        const filterButtonsDiv = document.getElementById('filter-buttons');
        
        // Add "All" button
        let buttonsHTML = `<button class="channel-filter-btn ${selectedChannel === 'all' ? 'active' : ''}" onclick="filterByChannel('all')">All</button>`;
        
        // Add hardcoded channel buttons
        buttonsHTML += `<button class="channel-filter-btn ${selectedChannel === 'C05B6DBN802' ? 'active' : ''}" 
                               onclick="filterByChannel('C05B6DBN802')"
                               title="Latest happenings and announcements">
                           #happenings
                       </button>`;
                       
        buttonsHTML += `<button class="channel-filter-btn ${selectedChannel === 'C0NP503L7' ? 'active' : ''}" 
                               onclick="filterByChannel('C0NP503L7')"
                               title="Hackathon announcements and updates">
                           #hackathons
                       </button>`;
                       
        buttonsHTML += `<button class="channel-filter-btn ${selectedChannel === 'C0M8PUPU6' ? 'active' : ''}" 
                               onclick="filterByChannel('C0M8PUPU6')"
                               title="Latest projects and creations shipped">
                           #ship
                       </button>`;

        buttonsHTML += `<button class="channel-filter-btn ${selectedChannel === 'C0266FRGT' ? 'active' : ''}" 
                               onclick="filterByChannel('C0266FRGT')"
                               title="Important announcements and updates">
                           #announcements
                       </button>`;
        
        // Add other channel buttons
        if (channels.length > 0) {
        buttonsHTML += channels
        .filter(channel => channel.id !== 'C05B6DBN802' && channel.id !== 'C0NP503L7' && channel.id !== 'C0M8PUPU6' && channel.id !== 'C0266FRGT') // Don't duplicate hardcoded channels
        .filter(channel => !channel.is_private) // Only show public channels
        .map(channel => `
        <button class="channel-filter-btn ${selectedChannel === channel.id ? 'active' : ''}" 
        onclick="filterByChannel('${channel.id}')"
            title="${channel.purpose || 'No description'}">
            #${channel.name}
            </button>
                `).join('');
                }
        
        filterButtonsDiv.innerHTML = buttonsHTML;
    } catch (error) {
        console.error('Error loading channels:', error);
        // Fallback: show at least All and hardcoded channel buttons
        document.getElementById('filter-buttons').innerHTML = `
            <button class="channel-filter-btn ${selectedChannel === 'all' ? 'active' : ''}" onclick="filterByChannel('all')">All</button>
            <button class="channel-filter-btn ${selectedChannel === 'C05B6DBN802' ? 'active' : ''}" 
                    onclick="filterByChannel('C05B6DBN802')"
                    title="Latest happenings and announcements">
                #happenings
            </button>
            <button class="channel-filter-btn ${selectedChannel === 'C0NP503L7' ? 'active' : ''}" 
                    onclick="filterByChannel('C0NP503L7')"
                    title="Hackathon announcements and updates">
                #hackathons
            </button>
            <button class="channel-filter-btn ${selectedChannel === 'C0M8PUPU6' ? 'active' : ''}" 
                    onclick="filterByChannel('C0M8PUPU6')"
                    title="Latest projects and creations shipped">
                #ship
            </button>
            <span style="color: red; margin-left: 10px;">Error loading other channels</span>
        `;
    }
}

function filterByChannel(channelId) {
    selectedChannel = channelId;
    
    // Update button states
    document.querySelectorAll('.channel-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Display filtered messages
    displayFilteredMessages();
}



// Show initial skeleton loading
function showSkeletonLoading() {
    // Events skeleton
    document.getElementById('events-list').innerHTML = `
        <div class="skeleton-event">
            <div class="skeleton skeleton-line title"></div>
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line medium"></div>
        </div>
        <div class="skeleton-event">
            <div class="skeleton skeleton-line title"></div>
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line long"></div>
        </div>
    `;
    
    // Hackathons skeleton
    document.getElementById('hackathons-list').innerHTML = `
        <div class="skeleton-event">
            <div class="skeleton skeleton-line title"></div>
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line medium"></div>
        </div>
    `;
    
    // Slack skeleton
    document.getElementById('slack-list').innerHTML = `
        <div class="skeleton-message">
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line medium"></div>
            <div class="skeleton skeleton-line long"></div>
        </div>
        <div class="skeleton-message">
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line long"></div>
            <div class="skeleton skeleton-line medium"></div>
        </div>
    `;
}

// Load events when page loads
document.addEventListener('DOMContentLoaded', async () => {
    // Show skeleton loading immediately
    showSkeletonLoading();
    
    console.log('📅 Loading events from events.hackclub.com');
    await loadEvents();
    console.log('🎯 Loading hackathons from hackathons.hackclub.com');
    await loadHackathons();
    console.log('🔗 Loading Slack channels');
    await loadChannels(); // Load channels first
    console.log('💬 Loading Slack messages');
    await loadSlackData(); // Then load messages so channel names are available
});

// Refresh data every 5 minutes
setInterval(async () => {
    await loadChannels(); // Load channels first
    await loadSlackData(); // Then load messages
    await loadEvents();
    await loadHackathons();
}, 5 * 60 * 5000);
