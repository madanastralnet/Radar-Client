import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert, Modal, ActivityIndicator, Platform } from 'react-native';
import { styles } from '../styles/styles';
import { MAX_TARGETS } from '../utils/constants';
import RadarVisualization from '../components/RadarVisualization';
import FallAlert from '../components/FallAlert';
import DeviceSettings from '../components/DeviceSettings';
// Add WebSocket import if using React Native WebSocket API
// If using a different WebSocket implementation, adjust accordingly
const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

const MainScreen = () => {
  // Move all state declarations to the top level of the component
  const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [socket, setSocket] = useState(null);
  const [statusColor, setStatusColor] = useState('#ff3b30');
  const [targets, setTargets] = useState([]);
  const [zones, setZones] = useState([]);
  const [activeZones, setActiveZones] = useState(new Set());
  const [deletingZones, setDeletingZones] = useState(new Set());
  const [zoneLogs, setZoneLogs] = useState({});
  const [receivedZoneLogs, setReceivedZoneLogs] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showFallAlert, setShowFallAlert] = useState(false);
  const [activeView, setActiveView] = useState('zones');
  const [fallLogs, setFallLogs] = useState([]);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [newFallDetected, setNewFallDetected] = useState(false);
  const [debugInfo, setDebugInfo] = useState({
    lastMessage: "None",
    zonesCount: 0,
    logsCount: 0,
    connectionEvents: []
  });
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  // Define all refs at the top level
  const prevActiveZonesRef = useRef(new Set());
  const retryTimeoutRef = useRef(null);
  const isConnectingRef = useRef(false);
  const lastConnectionAttemptRef = useRef(0);
  const messageResponseTimeoutRef = useRef(null);
  const lastMessageSentTimeRef = useRef(0);
  const lastMessageReceivedTimeRef = useRef(0);
  const lastMessageTimeRef = useRef(Date.now());

  // Constants
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;
  const maxReconnectDelay = 30000;

  // Move the memoized state to the top level
  const currentState = useMemo(() => {
    return {
      activeZones: new Set(activeZones),
      targets: [...targets],
      zones: [...zones]
    };
  }, [activeZones, targets, zones]);

  // Update the WebSocket connection effect to request data on connection
  useEffect(() => {
    if (connectionStatus === 'Connected' && socket) {
      console.log('WebSocket connected, requesting initial data...');
      
      // Request zones and logs immediately after connection
      setTimeout(() => {
        if (socket && socket.readyState === WebSocketState.OPEN) {
          console.log('Requesting zones from server...');
          sendWebSocketMessage({ type: 'request_zones' });
          
          // Wait a short moment before requesting logs to avoid overwhelming the server
          setTimeout(() => {
            if (socket && socket.readyState === WebSocketState.OPEN) {
              console.log('Requesting logs from server...');
              sendWebSocketMessage({ type: 'request_logs' });
              handleFallLogsRequest();
            }
          }, 500);
        }
      }, 100);

      // Heartbeat interval
      const heartbeatInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocketState.OPEN) {
          console.log('Sending heartbeat ping...');
          sendWebSocketMessage({ type: 'ping' });
        } else if (connectionStatus === 'Connected') {
          console.log('Heartbeat detected closed socket despite Connected status, reconnecting...');
          forceReconnect();
        }
      }, 30000);

      // Data check interval - periodically verify we have data
      const dataCheckInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocketState.OPEN) {
          if (zones.length === 0) {
            console.log('No zones loaded, requesting from server...');
            sendWebSocketMessage({ type: 'request_zones' });
          }
          if (!receivedZoneLogs) {
            console.log('No logs received, requesting from server...');
            sendWebSocketMessage({ type: 'request_logs' });
          }
        }
      }, 30000);

      // Connection check interval
      const connectionCheckInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastMessageTimeRef.current > 120000 && 
            socket && 
            socket.readyState === WebSocketState.OPEN) {
          console.log('No messages received for 2 minutes, forcing reconnect...');
          forceReconnect();
        }
      }, 30000);

      // Cleanup function
      return () => {
        console.log('Clearing WebSocket intervals');
        clearInterval(heartbeatInterval);
        clearInterval(dataCheckInterval);
        clearInterval(connectionCheckInterval);
      };
    }
  }, [connectionStatus, socket, zones.length, receivedZoneLogs, sendWebSocketMessage, forceReconnect, handleFallLogsRequest]);

  // Update the WebSocket message handler to properly handle zone responses
  const handleWebSocketMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      const messageType = data.type || "unknown";
      lastMessageReceivedTimeRef.current = Date.now();
      lastMessageTimeRef.current = Date.now();
      
      console.log('Received WebSocket message:', messageType);
      
      // Clear any pending timeout
      if (messageResponseTimeoutRef.current) {
        clearTimeout(messageResponseTimeoutRef.current);
        messageResponseTimeoutRef.current = null;
      }
      
      switch (messageType) {
        case 'zones_response':
          console.log('Received zones response:', data.zones);
          if (data.zones) {
            setZones(Object.values(data.zones));
          }
          break;
          
        case 'zone_deleted':
          console.log('Received zone deletion confirmation:', data);
          if (data.success && data.zoneId) {
            handleZoneDeleteConfirmation(data.zoneId);
          }
          break;

        case 'zones_data':
          console.log('Received updated zones data:', data.zones);
          if (data.zones) {
            setZones(Object.values(data.zones));
          }
          break;
          
        case 'zone_logs_response':
          console.log('Received zone logs response');
          if (data.logs) {
            setZoneLogs(data.logs);
            setReceivedZoneLogs(true);
          }
          break;
          
        case 'fall_logs_response':
          console.log('Received fall logs response:', data);
          if (data.logs) {
            setFallLogs(data.logs);
          }
          break;
          
        case 'target_update':
          if (data.targets) {
            setTargets(data.targets);
          }
          break;
          
        case 'fall_event':
          console.log('Received fall event:', data);
          setShowFallAlert(true);
          setNewFallDetected(true);
          break;
          
        case 'zone_event':
          console.log('Received zone event:', data);
          break;
          
        case 'pong':
          // Heartbeat response, just log it
          console.log('Received pong response');
          break;
          
        case 'error':
          console.error('Received error from server:', data.error);
          break;
          
        default:
          console.log('Unhandled message type:', messageType);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }, []);

  // Check if a target is inside a zone
  const isTargetInZone = useCallback((target, zone) => {
    let inside = false;
    for (let i = 0, j = zone.points.length - 1; i < zone.points.length; j = i++) {
      const xi = zone.points[i].x, yi = zone.points[i].y;
      const xj = zone.points[j].x, yj = zone.points[j].y;
      
      if (((yi > target.y) !== (yj > target.y)) &&
          (target.x < (xj - xi) * (target.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }, []);

  // Combined effect to track active zones and create logs
  useEffect(() => {
    if (zones.length === 0 || targets.length === 0) return;

    const currentActiveZones = new Set();
    const newLogs = {};
    let hasChanges = false;

    zones.forEach(zone => {
      const targetsInZone = targets.filter(target => isTargetInZone(target, zone));
      const isActive = targetsInZone.length > 0;
      const wasActive = prevActiveZonesRef.current.has(zone.id);

      // Update active zones
      if (isActive) {
        currentActiveZones.add(zone.id);
      }

      // Check for state change
      if (isActive !== wasActive) {
        hasChanges = true;

        // Create log entry
        const logEntry = {
          timestamp: new Date().toISOString(),
          type: isActive ? 'occupied' : 'unoccupied',
          targetCount: targetsInZone.length,
          targets: targetsInZone.map(t => ({ id: t.id, x: t.x, y: t.y }))
        };

        // Initialize logs array if needed
        if (!newLogs[zone.id]) {
          newLogs[zone.id] = [];
        }
        newLogs[zone.id].push(logEntry);
      }
    });

    // Only update states if there are actual changes
    if (hasChanges) {
      // Batch the state updates
      const batchedUpdates = () => {
        setZoneLogs(prevLogs => {
          const updatedLogs = { ...prevLogs };
          Object.keys(newLogs).forEach(zoneId => {
            if (!updatedLogs[zoneId]) {
              updatedLogs[zoneId] = [];
            }
            updatedLogs[zoneId].push(...newLogs[zoneId]);
          });
          return updatedLogs;
        });

        setActiveZones(currentActiveZones);
      };

      // Use requestAnimationFrame to batch updates
      requestAnimationFrame(batchedUpdates);
    }

    prevActiveZonesRef.current = currentActiveZones;
  }, [zones, targets, isTargetInZone]); // Remove activeZones from dependencies

  // Cleanup function to limit number of stored targets with throttling
  const cleanupTargets = useCallback(() => {
    setTargets(prev => {
      if (prev.length > MAX_TARGETS) {
        return prev.slice(-MAX_TARGETS);
      }
      return prev;
    });
  }, []);

  // Run cleanup with throttling
  useEffect(() => {
    const throttledCleanup = setTimeout(cleanupTargets, 5000);
    return () => clearTimeout(throttledCleanup);
  }, [cleanupTargets, targets]);

  const handleZoneDelete = (zoneId) => {
    Alert.alert(
      "Delete Zone",
      "Are you sure you want to delete this zone?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setDeletingZones(prev => new Set(prev).add(zoneId));
            const deleteRequest = {
              type: 'delete_zone',
              zoneId: zoneId
            };
            console.log('Sending zone delete request:', deleteRequest);
            if (socket && socket.readyState === WebSocketState.OPEN) {
              sendWebSocketMessage(deleteRequest);
            }
          }
        }
      ]
    );
  };

  // Add handler for zone delete confirmation
  const handleZoneDeleteConfirmation = useCallback((zoneId) => {
    console.log('Zone delete confirmed for zone ID:', zoneId);
    
    // Remove zone from zones list
    setZones(prev => prev.filter(zone => zone.id !== zoneId));
    
    // Remove zone from active zones set
    setActiveZones(prev => {
      const newSet = new Set(prev);
      newSet.delete(zoneId);
      return newSet;
    });
    
    // Remove zone from deleting zones set
    setDeletingZones(prev => {
      const newSet = new Set(prev);
      newSet.delete(zoneId);
      return newSet;
    });
    
    // Remove zone logs for this zone
    setZoneLogs(prev => {
      const newLogs = { ...prev };
      delete newLogs[zoneId];
      return newLogs;
    });
    
    // If the deleted zone was the selected zone, close the logs modal
    if (selectedZone && selectedZone.id === zoneId) {
      setSelectedZone(null);
      setShowLogs(false);
    }
    
    console.log('Zone and logs deleted successfully');
  }, [selectedZone]);

  const handleZonePress = (zone) => {
    setSelectedZone(zone);
    setShowLogs(true);
    handleZoneLogsRequest(zone.id);
  };

  // Add a state for tracking pending zones
  const [pendingZones, setPendingZones] = useState(new Set());

  // Add state and refs for tracking message handling
  const [serverHealthStatus, setServerHealthStatus] = useState('unknown');

  // Add a function to send WebSocket messages with tracking
  const sendWebSocketMessage = useCallback((message) => {
    if (socket && socket.readyState === WebSocketState.OPEN) {
      try {
        const messageStr = JSON.stringify(message);
        socket.send(messageStr);
        lastMessageSentTimeRef.current = Date.now();
        
        // Clear any existing timeout
        if (messageResponseTimeoutRef.current) {
          clearTimeout(messageResponseTimeoutRef.current);
        }
        
        // Set a new timeout
        messageResponseTimeoutRef.current = setTimeout(() => {
          console.log('No response received for message within timeout period');
          if (Date.now() - lastMessageReceivedTimeRef.current > 15000) {
            console.log('Server appears to be stuck, forcing reconnect');
            forceReconnect();
          }
        }, 15000);
        
        return true;
      } catch (e) {
        console.error('Error sending WebSocket message:', e);
        return false;
      }
    } else {
      console.warn('Cannot send message, WebSocket not connected');
      return false;
    }
  }, [socket, forceReconnect]);

  // Modify handleNewZone to use sendWebSocketMessage
  const handleNewZone = useCallback((zoneData, skipWebSocketSend = false) => {
    console.log('Creating new zone:', zoneData);
    
    setZones(prev => {
      // Check if zone already exists
      const existingZoneIndex = prev.findIndex(zone => zone.id === zoneData.id);
      if (existingZoneIndex !== -1) {
        console.log(`Zone ${zoneData.id} already exists, skipping creation`);
        return prev;
      }
      return [...prev, zoneData];
    });

    if (!skipWebSocketSend && socket && socket.readyState === WebSocketState.OPEN) {
      const newZoneRequest = {
        type: 'new_zone',
        zone: zoneData
      };
      console.log('Sending new zone request:', newZoneRequest);
      
      const success = sendWebSocketMessage(newZoneRequest);
      
      if (success) {
        console.log('Zone message sent to server');
        setPendingZones(prev => new Set(prev).add(zoneData.id));
      }
    }
  }, [socket, sendWebSocketMessage]);

  // Connect to the WebSocket server
  const connectWebSocket = useCallback(() => {
    const now = Date.now();
    const timeSinceLastAttempt = now - lastConnectionAttemptRef.current;
    
    // Prevent rapid reconnection attempts but use shorter interval for initial connection
    if (timeSinceLastAttempt < 5000) {  // 5 seconds between attempts
      console.log('Skipping connection attempt - too soon since last attempt');
      return;
    }

    if (isConnectingRef.current) {
      console.log('Already attempting to connect, skipping duplicate attempt');
      return;
    }

    if (connectionAttempts >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached, waiting for manual reconnect');
      setConnectionStatus('Max attempts reached');
      return;
    }

    try {
      isConnectingRef.current = true;
      lastConnectionAttemptRef.current = now;
      
      setConnectionStatus('Connecting...');
      setStatusColor('#ffcc00');
      
      // Clear any existing retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      console.log('Attempting to connect to WebSocket server...');
      
      // Create a new WebSocket instance
      const ws = new WebSocket('ws://192.168.29.28:9001');
      
      // Set up event handlers
      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('Connected');
        setStatusColor('#34c759');
        setConnectionAttempts(0);
        isConnectingRef.current = false;
        setSocket(ws);
        
        // Add connection event to debug info
        setDebugInfo(prev => ({
          ...prev,
          connectionEvents: [
            ...prev.connectionEvents.slice(-9),
            { event: 'Connected', time: new Date().toLocaleTimeString() }
          ]
        }));
      };
      
      ws.onclose = (event) => {
        const closeTime = Date.now();
        console.log(`WebSocket disconnected, code: ${event.code}, reason: ${event.reason}`);
        setSocket(null);
        isConnectingRef.current = false;
        
        // Add connection event to debug info
        setDebugInfo(prev => ({
          ...prev,
          connectionEvents: [
            ...prev.connectionEvents.slice(-9),
            { event: 'Disconnected', time: new Date().toLocaleTimeString() }
          ]
        }));
        
        // Skip reconnection if this is a normal closure or max attempts reached
        if (event.code === 1000 || event.code === 1001 || connectionAttempts >= maxReconnectAttempts) {
          setConnectionStatus('Disconnected');
          setStatusColor('#ff3b30');
          return;
        }
        
        // Only increment connection attempts once per disconnection
        setConnectionAttempts(prev => prev + 1);
        
        // Use exponential backoff for retry with increased base delay
        const retryDelay = Math.min(
          5000 * Math.pow(1.5, connectionAttempts),  // Use 5 second base delay with slower growth
          maxReconnectDelay
        );
        
        setConnectionStatus(`Reconnecting in ${Math.round(retryDelay/1000)}s...`);
        setStatusColor('#ffcc00');
        
        // Schedule reconnection after delay
        console.log(`Scheduling reconnection in ${Math.round(retryDelay/1000)}s`);
        retryTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, retryDelay);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Error handling is done in onclose
      };
      
      // Rest of the onmessage handler remains unchanged
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const messageType = data.type || "unknown";
          lastMessageReceivedTimeRef.current = Date.now();
          lastMessageTimeRef.current = Date.now();
          
          console.log('Received WebSocket message:', messageType);
          
          // Process the message based on its type
          switch (messageType) {
            case 'zones_response':
              console.log('Received zones response:', data.zones);
              if (data.zones) {
                setZones(Object.values(data.zones));
              }
              break;
              
            case 'zone_deleted':
              console.log('Received zone deletion confirmation:', data);
              if (data.success && data.zoneId) {
                handleZoneDeleteConfirmation(data.zoneId);
              }
              break;
    
            case 'zones_data':
              console.log('Received updated zones data:', data.zones);
              if (data.zones) {
                setZones(Object.values(data.zones));
              }
              break;
              
            case 'zone_logs_response':
              console.log('Received zone logs response');
              if (data.logs) {
                setZoneLogs(data.logs);
                setReceivedZoneLogs(true);
              }
              break;
              
            case 'fall_logs_response':
              console.log('Received fall logs response:', data);
              if (data.logs) {
                setFallLogs(data.logs);
              }
              break;
              
            case 'target_update':
              if (data.targets) {
                setTargets(data.targets);
              }
              break;
              
            case 'fall_event':
              console.log('Received fall event:', data);
              setShowFallAlert(true);
              setNewFallDetected(true);
              break;
              
            case 'zone_event':
              console.log('Received zone event:', data);
              break;
              
            case 'pong':
              // Heartbeat response, just log it
              console.log('Received pong response');
              break;
              
            case 'error':
              console.error('Received error from server:', data.error);
              break;
              
            default:
              console.log('Unhandled message type:', messageType);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      isConnectingRef.current = false;
      setConnectionStatus('Connection Error');
      setStatusColor('#ff3b30');
      
      // Schedule a retry with a short delay for initial connection attempts
      setTimeout(() => {
        connectWebSocket();
      }, 3000);
    }
  }, [connectionAttempts, handleZoneDeleteConfirmation]);

  // Initial connection and cleanup
  useEffect(() => {
    console.log('Initial connection useEffect running');
    connectWebSocket();
    
    return () => {
      if (socket) {
        socket.close();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [connectWebSocket]);

  // Force reconnect function
  const forceReconnect = useCallback(() => {
    console.log('Force reconnecting WebSocket...');
    
    // Close existing socket if it exists
    if (socket) {
      try {
        socket.close(3001, 'Force reconnection');
      } catch (e) {
        console.error('Error closing socket for reconnect:', e);
      }
    }
    
    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    // Reset connection state to prevent rapid reconnects
    lastConnectionAttemptRef.current = Date.now() - 25000; // Allow reconnect after 5 more seconds
    
    // Reset connection attempts if we haven't tried too many times recently
    if (connectionAttempts > 3) {
      setConnectionAttempts(3); // Reset to a lower number but not 0
    }
    
    // Schedule immediate reconnection
    setTimeout(() => {
      connectWebSocket();
    }, 1000);
  }, [socket, connectWebSocket]);

  // Reset connection attempts periodically - extend reset interval
  useEffect(() => {
    const resetTimer = setInterval(() => {
      if (connectionStatus === 'Connected') {
        // Only reset if we're connected
        setConnectionAttempts(0);
      }
    }, 300000); // Reset every 5 minutes if connected (changed from every minute)

    return () => clearInterval(resetTimer);
  }, [connectionStatus]);

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const renderZoneLogs = () => {
    if (!selectedZone) return null;

    const logs = zoneLogs[selectedZone.id] || [];
    const reversedLogs = [...logs].reverse(); // Show newest first

    return (
      <View style={styles.logsContainer}>
        <Text style={styles.logsTitle}>Zone: {selectedZone.name}</Text>
        {logs.length === 0 ? (
          <Text style={styles.noLogsText}>No activity logs available</Text>
        ) : (
          <ScrollView 
            style={styles.logsScroll}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            {reversedLogs.map((log, index) => (
              <View 
                key={index} 
                style={[
                  styles.logEntry,
                  log.type === 'occupied' ? styles.logEntryOccupied : styles.logEntryUnoccupied
                ]}
              >
                <View style={styles.logEntryContent}>
                  <Text style={styles.logEntryText}>
                    {log.type === 'occupied' ? 'Occupied' : 'Unoccupied'}
                  </Text>
                  {log.type === 'occupied' && (
                    <Text style={styles.logEntryCount}>
                      {log.targetCount} target{log.targetCount !== 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
                <Text style={styles.logEntryTime}>
                  {formatTimestamp(log.timestamp)}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  // Add fall logs request handler
  const handleFallLogsRequest = () => {
    if (socket && socket.readyState === WebSocketState.OPEN) {
      console.log('Sending fall logs request...');
      const requestData = {
        type: 'fall_logs',
        start_time: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
        end_time: Date.now()
      };
      console.log('Request data:', requestData);
      sendWebSocketMessage(requestData);
    } else {
      console.log('Cannot send fall logs request: WebSocket not connected');
    }
  };

  // Sort fall logs by timestamp in descending order (newest first)
  const sortedFallLogs = useMemo(() => {
    console.log('Sorting fall logs. Total logs:', fallLogs.length);
    const sorted = [...fallLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    console.log('Sorted logs:', sorted.map(log => ({
      timestamp: log.timestamp,
      event_type: log.event_type,
      target_id: log.target_id,
      height: log.height,
      position: log.position
    })));
    return sorted;
  }, [fallLogs]);

  // Add handler for zone logs request
  const handleZoneLogsRequest = (zoneId) => {
    if (socket && socket.readyState === WebSocketState.OPEN) {
      console.log('Sending zone logs request for zone:', zoneId);
      const requestData = {
        type: 'request_logs',
        zone_id: zoneId
      };
      console.log('Request data:', requestData);
      sendWebSocketMessage(requestData);
    } else {
      console.log('Cannot send zone logs request: WebSocket not connected');
    }
  };

  // Add a specific function to handle when a long period passes without zones being confirmed
  useEffect(() => {
    if (pendingZones.size > 0 && connectionStatus === 'Connected') {
      // If zones are pending too long, try a more aggressive approach
      const longPendingTimeout = setTimeout(() => {
        if (pendingZones.size > 0) {
          console.log(`Zones pending for too long (${pendingZones.size} zones), forcing server reconnection`);
          forceReconnect();
        }
      }, 30000); // After 30 seconds of pending zones
      
      return () => clearTimeout(longPendingTimeout);
    }
  }, [pendingZones, connectionStatus, forceReconnect]);

  // Add ensureDataIsLoaded function before the return statement
  const ensureDataIsLoaded = useCallback(() => {
    console.log('Ensuring data is loaded...');
    if (socket && socket.readyState === WebSocketState.OPEN) {
      // Request zones if none are loaded
      if (zones.length === 0) {
        console.log('No zones loaded, requesting from server...');
        sendWebSocketMessage({ type: 'request_zones' });
      }
      
      // Request logs if not received
      if (!receivedZoneLogs) {
        console.log('No logs received, requesting from server...');
        sendWebSocketMessage({ type: 'request_logs' });
      }
      
      // Request fall logs
      handleFallLogsRequest();
      
      // Send a ping to ensure connection is active
      sendWebSocketMessage({ type: 'ping' });
    } else {
      console.log('Cannot load data: WebSocket not connected');
      // Try to reconnect if socket is closed
      if (!socket || socket.readyState === WebSocketState.CLOSED) {
        console.log('Attempting to reconnect...');
        forceReconnect();
      }
    }
  }, [socket, zones.length, receivedZoneLogs, sendWebSocketMessage, forceReconnect, handleFallLogsRequest]);

  const toggleFallDetection = () => {
    setNewFallDetected(false);
    setActiveView('fall');
    
    if (socket && socket.readyState === WebSocketState.OPEN) {
      // Request fresh fall logs when switching to this view
      handleFallLogsRequest();
    }
  };

  return (
    <SafeAreaView style={styles.mainContainer}>
      <View style={styles.headerContainer}>
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => setShowMenu(true)}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.mainTitle}>Sentinel</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.statusIndicator}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusText}>{connectionStatus}</Text>
          </View>
        </View>
      </View>

      <View style={styles.radarContainer}>
        <View style={{ flex: 1, width: '100%', height: '100%' }}>
          <RadarVisualization 
            targets={targets} 
            socket={socket} 
            onZoneCreated={handleNewZone}
            zones={zones}
            isTargetInZone={isTargetInZone}
          />
        </View>
      </View>

      <View style={styles.bottomContainer}>
        <View style={styles.viewToggle}>
          <TouchableOpacity 
            style={[styles.toggleButton, activeView === 'zones' && styles.toggleButtonActive]}
            onPress={() => setActiveView('zones')}
          >
            <Text style={[styles.toggleButtonText, activeView === 'zones' && styles.toggleButtonTextActive]}>
              Zones
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.toggleButton,
              activeView === 'fall' ? styles.toggleButtonActive : null,
              newFallDetected ? styles.toggleButtonFallAlert : null
            ]}
            onPress={toggleFallDetection}
          >
            <Text style={[
              styles.toggleButtonText, 
              activeView === 'fall' && styles.toggleButtonTextActive
            ]}>
              Fall Detection {newFallDetected ? '!' : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {activeView === 'zones' ? (
          <View style={styles.zonesContainer}>
            <Text style={styles.zonesTitle}>Zones</Text>
            <ScrollView style={styles.zonesScroll}>
              {zones.length > 0 ? (
                zones.map((zone) => (
                  <TouchableOpacity
                    key={zone.id}
                    style={[
                      styles.zoneItem,
                      activeZones.has(zone.id) && styles.zoneItemActive,
                      deletingZones.has(zone.id) && styles.zoneItemDeleting
                    ]}
                    onPress={() => handleZonePress(zone)}
                    onLongPress={() => handleZoneDelete(zone.id)}
                    disabled={deletingZones.has(zone.id)}
                  >
                    <Text style={[
                      styles.zoneName,
                      activeZones.has(zone.id) && styles.zoneNameActive
                    ]}>
                      {zone.name}
                    </Text>
                    {deletingZones.has(zone.id) && (
                      <View style={styles.loadingIndicator}>
                        <ActivityIndicator size="small" color="#ff3b30" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.noLogsText}>No zones created</Text>
              )}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.fallLogsContainer}>
            <Text style={styles.fallLogsTitle}>Fall Detection Logs</Text>
            <ScrollView style={styles.fallLogsScroll}>
              {sortedFallLogs.length > 0 ? (
                sortedFallLogs.map((log, index) => (
                  <View key={index} style={styles.fallLogItem}>
                    <Text style={styles.fallLogTime}>
                      {new Date(log.timestamp).toLocaleString()}
                    </Text>
                    <Text style={styles.fallLogDetails}>
                      Event: {log.event_type} | Target ID: {log.target_id}
                    </Text>
                    <Text style={styles.fallLogDetails}>
                      Height: {log.height.current} {log.height.unit}
                    </Text>
                    <Text style={styles.fallLogDetails}>
                      Position: ({log.position.x}, {log.position.y}, {log.position.z}) {log.position.unit}
                    </Text>
                    {log.event_type === 'fall' && log.height_history && (
                      <Text style={styles.fallLogDetails}>
                        Height History: {log.height_history.values.join(', ')} {log.height_history.unit}
                      </Text>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.noLogsText}>No fall detection logs</Text>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      <Modal
        visible={showMenu}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMenu(false)}
      >
        <View style={styles.menuContainer}>
          <View style={styles.menuContent}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Menu</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowMenu(false)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.menuOptions}>
              <TouchableOpacity style={styles.menuOption}>
                <Text style={styles.menuOptionText}>Account</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.menuOption}
                onPress={() => {
                  setShowMenu(false);
                  setShowDeviceSettings(true);
                }}
              >
                <Text style={styles.menuOptionText}>Device</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.menuFooter}>
              <Text style={styles.menuFooterText}>SanAura</Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showLogs}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLogs(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Zone Logs</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowLogs(false)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            {renderZoneLogs()}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDeviceSettings}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowDeviceSettings(false)}
      >
        <SafeAreaView style={styles.deviceSettingsContainer}>
          <View style={styles.deviceSettingsHeader}>
            <Text style={styles.deviceSettingsTitle}>Device Settings</Text>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setShowDeviceSettings(false)}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
          <DeviceSettings 
            config={{
              fall_detection_enabled: true,
              sensitivity: 50,
              frame_time: 55,
              websocket_host: '192.168.29.28',
              websocket_port: 9001
            }}
            onSaveConfig={(newConfig) => {
              console.log('Saving new config:', newConfig);
              if (socket && socket.readyState === WebSocketState.OPEN) {
                sendWebSocketMessage({
                  type: 'update_config',
                  config: newConfig
                });
              }
              setShowDeviceSettings(false);
            }}
            wsClient={socket}
          />
        </SafeAreaView>
      </Modal>

      {showFallAlert && (
        <FallAlert onClose={() => setShowFallAlert(false)} />
      )}
    </SafeAreaView>
  );
};

export default MainScreen;