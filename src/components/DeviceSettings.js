import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Animated } from 'react-native';
import Slider from '@react-native-community/slider';

const DeviceSettings = ({ config, onSaveConfig, wsClient }) => {
  const [settings, setSettings] = useState({
    fall_detection_enabled: config.fall_detection_enabled,
    sensitivity: config.sensitivity,
    frame_time: config.frame_time,
    websocket_host: config.websocket_host,
    websocket_port: config.websocket_port
  });

  const [sliderValue, setSliderValue] = useState(config.sensitivity);
  const [hasChanges, setHasChanges] = useState(false);
  const isSliding = useRef(false);
  const slideAnim = React.useRef(new Animated.Value(config.fall_detection_enabled ? 1 : 0)).current;

  // Check for changes whenever settings are updated
  useEffect(() => {
    const changesDetected = 
      settings.fall_detection_enabled !== config.fall_detection_enabled ||
      settings.sensitivity !== config.sensitivity ||
      settings.frame_time !== config.frame_time ||
      settings.websocket_host !== config.websocket_host ||
      settings.websocket_port !== config.websocket_port;
    
    setHasChanges(changesDetected);
  }, [settings, config]);

  // Debug WebSocket connection
  useEffect(() => {
    if (wsClient) {
      console.log('DeviceSettings: WebSocket client received:', wsClient);
      console.log('DeviceSettings: WebSocket readyState:', wsClient.readyState);
      
      // Request settings immediately if WebSocket is open
      if (wsClient.readyState === WebSocket.OPEN) {
        console.log('DeviceSettings: WebSocket already open, requesting settings...');
        requestFallDetectionSettings();
      } else {
        // Wait for connection to be established
        const handleOpen = () => {
          console.log('DeviceSettings: WebSocket connection opened');
          // Add a small delay to ensure connection is stable
          setTimeout(() => {
            requestFallDetectionSettings();
          }, 500);
        };

        wsClient.addEventListener('open', handleOpen);
        return () => {
          wsClient.removeEventListener('open', handleOpen);
        };
      }
    } else {
      console.log('DeviceSettings: No WebSocket client available');
    }
  }, [wsClient]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!wsClient) {
      console.log('DeviceSettings: No WebSocket client available');
      return;
    }

    const handleMessage = (event) => {
      try {
        console.log('DeviceSettings: Raw WebSocket message:', event.data);
        const data = JSON.parse(event.data);
        console.log('DeviceSettings: Parsed WebSocket message:', data);
        
        if (data.type === 'fall_detection_settings') {
          console.log('DeviceSettings: Processing fall detection settings:', data.settings);
          const { enabled, sensitivity, frame_time_ms } = data.settings;
          
          // Convert sensitivity from 0-1 to 0-100 for the slider
          const sliderSensitivity = Math.round(sensitivity * 100);
          
          // Update state
          setSettings(prev => ({
            ...prev,
            fall_detection_enabled: enabled,
            sensitivity: sensitivity, // Keep original value for server
            frame_time: frame_time_ms
          }));
          
          // Update slider value with converted value
          setSliderValue(sliderSensitivity);
          
          // Update animation
          Animated.timing(slideAnim, {
            toValue: enabled ? 1 : 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
          
        } else if (data.type === 'fall_detection_update') {
          console.log('DeviceSettings: Processing fall detection update:', data);
          if (data.status === 'success') {
            const { enabled, sensitivity, frame_time_ms } = data.settings;
            
            // Convert sensitivity from 0-1 to 0-100 for the slider
            const sliderSensitivity = Math.round(sensitivity * 100);
            
            // Update state
            setSettings(prev => ({
              ...prev,
              fall_detection_enabled: enabled,
              sensitivity: sensitivity, // Keep original value for server
              frame_time: frame_time_ms
            }));
            
            // Update slider value with converted value
            setSliderValue(sliderSensitivity);
            
            // Update animation
            Animated.timing(slideAnim, {
              toValue: enabled ? 1 : 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
          } else {
            console.error('DeviceSettings: Failed to update settings:', data.message);
          }
        }
      } catch (error) {
        console.error('DeviceSettings: Error parsing WebSocket message:', error);
      }
    };

    wsClient.addEventListener('message', handleMessage);
    return () => {
      wsClient.removeEventListener('message', handleMessage);
    };
  }, [wsClient, slideAnim]);

  const requestFallDetectionSettings = () => {
    if (!wsClient) {
      console.log('DeviceSettings: No WebSocket client available for request');
      return;
    }

    if (wsClient.readyState === WebSocket.OPEN) {
      console.log('DeviceSettings: Requesting fall detection settings...');
      const request = {
        type: 'request_fall_detection_settings'
      };
      console.log('DeviceSettings: Sending request:', request);
      try {
        wsClient.send(JSON.stringify(request));
      } catch (error) {
        console.error('DeviceSettings: Error sending request:', error);
        // Retry after 1 second if WebSocket is not ready
        setTimeout(() => {
          if (wsClient.readyState === WebSocket.OPEN) {
            requestFallDetectionSettings();
          }
        }, 1000);
      }
    } else {
      console.log('DeviceSettings: WebSocket not ready for request, state:', wsClient.readyState);
      // Retry after 1 second if WebSocket is not ready
      setTimeout(() => {
        if (wsClient.readyState === WebSocket.OPEN) {
          requestFallDetectionSettings();
        }
      }, 1000);
    }
  };

  const updateFallDetectionSettings = (newSettings) => {
    if (!wsClient) {
      console.log('DeviceSettings: No WebSocket client available for update');
      return;
    }

    if (wsClient.readyState === WebSocket.OPEN) {
      console.log('DeviceSettings: Updating fall detection settings:', newSettings);
      const update = {
        type: 'update_fall_detection_settings',
        settings: newSettings
      };
      console.log('DeviceSettings: Sending update:', update);
      try {
        wsClient.send(JSON.stringify(update));
      } catch (error) {
        console.error('DeviceSettings: Error sending update:', error);
      }
    } else {
      console.log('DeviceSettings: WebSocket not ready for update, state:', wsClient.readyState);
    }
  };

  const handleSliderChange = useCallback((value) => {
    if (isSliding.current) {
      const roundedValue = Math.round(value);
      setSliderValue(roundedValue);
    }
  }, []);

  const handleSliderStart = useCallback(() => {
    isSliding.current = true;
  }, []);

  const handleSliderComplete = useCallback((value) => {
    isSliding.current = false;
    const roundedValue = Math.round(value);
    setSliderValue(roundedValue);
    
    // Convert slider value (0-100) back to server range (0-1)
    const serverSensitivity = roundedValue / 100;
    
    // Only update local state, don't send to server yet
    setSettings(prev => ({
      ...prev,
      sensitivity: serverSensitivity
    }));
  }, []);

  const toggleFallDetection = useCallback(() => {
    const newEnabled = !settings.fall_detection_enabled;
    
    // Animate the thumb movement
    Animated.timing(slideAnim, {
      toValue: newEnabled ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
    
    // Update local state
    setSettings(prev => ({
      ...prev,
      fall_detection_enabled: newEnabled
    }));
  }, [settings, slideAnim]);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 50],
  });

  const handleSave = () => {
    // Send all changes to server when save button is clicked
    updateFallDetectionSettings({
      enabled: settings.fall_detection_enabled,
      sensitivity: settings.sensitivity,
      frame_time_ms: parseInt(settings.frame_time)
    });

    // Save WebSocket settings
    const newConfig = {
      fall_detection: {
        enabled: settings.fall_detection_enabled,
        sensitivity: settings.sensitivity,
        frame_time_ms: parseInt(settings.frame_time)
      },
      websocket: {
        host: settings.websocket_host,
        port: parseInt(settings.websocket_port)
      }
    };
    onSaveConfig(newConfig);
    setHasChanges(false); // Reset changes after save
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fall Detection Settings</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Fall Detection</Text>
          <TouchableOpacity 
            style={[
              styles.toggleContainer,
              settings.fall_detection_enabled ? styles.toggleActive : styles.toggleInactive
            ]}
            onPress={toggleFallDetection}
          >
            <Animated.View 
              style={[
                styles.toggleThumb,
                {
                  transform: [{ translateX }]
                }
              ]}
            />
            <View style={styles.toggleLabelsContainer}>
              <Text style={[
                styles.toggleLabel,
                settings.fall_detection_enabled ? styles.toggleLabelActive : styles.toggleLabelInactive
              ]}>On</Text>
              <Text style={[
                styles.toggleLabel,
                !settings.fall_detection_enabled ? styles.toggleLabelActive : styles.toggleLabelInactive
              ]}>Off</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Sensitivity: {sliderValue}%</Text>
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderValue}>0</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={sliderValue}
              onValueChange={handleSliderChange}
              onSlidingStart={handleSliderStart}
              onSlidingComplete={handleSliderComplete}
              minimumTrackTintColor="#4CAF50"
              maximumTrackTintColor="#E0E0E0"
              thumbTintColor="#4CAF50"
            />
            <Text style={styles.sliderValue}>100</Text>
          </View>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Frame Time (ms)</Text>
          <TextInput
            style={styles.input}
            value={settings.frame_time.toString()}
            onChangeText={(text) => {
              const value = parseInt(text) || 0;
              setSettings(prev => ({
                ...prev,
                frame_time: value
              }));
            }}
            keyboardType="numeric"
            placeholder="Enter frame time"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WebSocket Configuration</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Host Address</Text>
          <TextInput
            style={styles.input}
            value={settings.websocket_host}
            onChangeText={(value) => setSettings({...settings, websocket_host: value})}
            placeholder="Enter host address"
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Port Number</Text>
          <TextInput
            style={styles.input}
            value={settings.websocket_port.toString()}
            onChangeText={(value) => setSettings({...settings, websocket_port: value})}
            keyboardType="numeric"
            placeholder="Enter port number"
          />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[
            styles.button, 
            hasChanges ? styles.saveButton : styles.saveButtonDisabled
          ]}
          onPress={handleSave}
        >
          <Text style={styles.buttonText}>Save Settings</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingLabel: {
    fontSize: 16,
    color: '#444',
    flex: 1,
  },
  toggleContainer: {
    width: 80,
    height: 30,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    position: 'relative',
  },
  toggleActive: {
    backgroundColor: '#4CAF50',
  },
  toggleInactive: {
    backgroundColor: '#E0E0E0',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    left: 2,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  toggleLabelsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    zIndex: 1,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  toggleLabelActive: {
    color: '#FFFFFF',
  },
  toggleLabelInactive: {
    opacity: 0.5,
  },
  input: {
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    width: 120,
    fontSize: 16,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 200,
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 10,
  },
  sliderValue: {
    fontSize: 14,
    color: '#666',
    width: 30,
    textAlign: 'center',
  },
  buttonContainer: {
    marginTop: 20,
    marginBottom: 40,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  saveButtonDisabled: {
    backgroundColor: '#9E9E9E',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default DeviceSettings;