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
    eventsListDiv.innerHTML = '<div class="loading">Loading events...</div>';
    
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
        eventsListDiv.innerHTML = '<p style="color: red;">Error loading events. Please try again.</p>';
        updateTimestamp();
    }
}

async function loadHackathons() {
    const hackathonsListDiv = document.getElementById('hackathons-list');
    hackathonsListDiv.innerHTML = '<div class="loading">Loading hackathons...</div>';
    
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
        hackathonsListDiv.innerHTML = '<p style="color: red;">Error loading hackathons. Please try again.</p>';
        updateTimestamp();
    }
}

let selectedChannel = 'all';
let allSlackData = [];
let channelNames = {};
let isAdminMode = false;
let adminToken = null;

// Function to parse Slack-formatted links and convert to HTML
function parseSlackLinks(text) {
    if (!text) return text;
    
    // Pattern to match Slack links: <https://example.com> or <https://example.com|Link Text>
    const linkPattern = /<(https?:\/\/[^|>]+)(\|([^>]+))?>/g;
    
    return text.replace(linkPattern, (match, url, pipe, linkText) => {
        const displayText = linkText || url;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${displayText}</a>`;
    });
}

async function loadSlackData() {
    const slackListDiv = document.getElementById('slack-list');
    slackListDiv.innerHTML = '<div class="loading">Loading Slack data...</div>';
    
    try {
        let url = '/api/slack-data';
        let options = {};
        
        if (isAdminMode && adminToken) {
            url = '/api/slack-data-admin';
            options.headers = { 'Authorization': adminToken };
        }
        
        const response = await fetch(url, options);
        
        if (response.status === 401) {
            alert('Invalid admin credentials. Switching to public mode.');
            isAdminMode = false;
            adminToken = null;
            return loadSlackData(); // Retry with public endpoint
        }
        
        allSlackData = await response.json();
        
        // Ensure we have channel names, if not load them
        if (Object.keys(channelNames).length === 0) {
            await loadChannels();
        }
        
        displayFilteredMessages();
    } catch (error) {
        console.error('Error loading Slack data:', error);
        slackListDiv.innerHTML = '<p style="color: red;">Error loading Slack data. Please try again.</p>';
    }
}

function displayFilteredMessages() {
    const slackListDiv = document.getElementById('slack-list');
    
    let filteredData = allSlackData;
    if (selectedChannel !== 'all') {
        filteredData = allSlackData.filter(message => message.channel === selectedChannel);
    }
    
    if (filteredData.length === 0) {
        slackListDiv.innerHTML = selectedChannel === 'all' ? 
            '<p>No Slack activity found.</p>' : 
            '<p>No messages in selected channel.</p>';
        return;
    }
    
    slackListDiv.innerHTML = filteredData.map(message => {
        const channelName = channelNames[message.channel] || message.channel;
        const displayChannel = channelName.startsWith('#') ? channelName : `#${channelName}`;
        const parsedText = parseSlackLinks(message.text);
        
        return `
            <div class="slack-message">
                <h4>Message</h4>
                <p><strong>Time:</strong> ${new Date(message.timestamp).toLocaleString()}</p>
                <p><strong>User:</strong> ${message.user}</p>
                <p><strong>Channel:</strong> ${displayChannel}</p>
                <div class="original-text">${parsedText}</div>
            </div>
        `;
    }).join('');
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
        .filter(channel => isAdminMode || !channel.is_private) // Hide private channels in public mode
        .map(channel => `
        <button class="channel-filter-btn ${selectedChannel === channel.id ? 'active' : ''}" 
        onclick="filterByChannel('${channel.id}')"
            title="${channel.purpose || 'No description'}">
            #${channel.name} ${channel.is_private ? '🔒' : ''}
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

function toggleAdminMode() {
    if (isAdminMode) {
        // Switch to public mode
        isAdminMode = false;
        adminToken = null;
        selectedChannel = 'all'; // Reset to show all available data
        document.getElementById('admin-toggle').textContent = 'Admin Mode';
        document.getElementById('admin-toggle').style.background = '#1a1a1a';
        loadSlackData(); // Reload with public data
        loadChannels(); // Reload channel filters
    } else {
        // Prompt for admin token
        const token = prompt('Enter admin password:');
        if (token) {
            adminToken = token;
            isAdminMode = true;
            selectedChannel = 'all'; // Reset to show all available data
            document.getElementById('admin-toggle').textContent = 'Public Mode';
            document.getElementById('admin-toggle').style.background = '#dc2626';
            loadSlackData(); // Reload with admin data
            loadChannels(); // Reload channel filters
        }
    }
}

// Load events when page loads
document.addEventListener('DOMContentLoaded', async () => {
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
