import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated, TextInput, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import Svg, { Circle, Rect, Line, G, Text as SvgText, Polygon, Polyline, Path } from 'react-native-svg';
import { styles } from '../styles/styles';
import { RADAR_CONFIG } from '../utils/constants';

const RadarVisualization = React.memo(({ targets, socket, onZoneCreated, zones, isTargetInZone }) => {
  const { width: svgWidth, height: svgHeight, scale, gridSize, targetWidth, targetHeight } = RADAR_CONFIG;
  const sensorX = svgWidth / 2;
  const sensorY = 15;

  // Zone state
  const [isCreatingZone, setIsCreatingZone] = useState(false);
  const [zonePoints, setZonePoints] = useState([]);
  const [isWaitingForName, setIsWaitingForName] = useState(false);
  const [tempZonePoints, setTempZonePoints] = useState([]);
  const [zoneName, setZoneName] = useState('');

  // Animation value for button
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonOpacity = useRef(new Animated.Value(1)).current;

  // Handle zone point creation
  const handleRadarPress = (event) => {
    if (!isCreatingZone) return;

    const { locationX, locationY } = event.nativeEvent;
    
    // Calculate the point relative to the radar's coordinate system
    const radarX = locationX - (svgWidth / 2);
    const radarY = locationY - sensorY;
    
    // Convert to radar grid coordinates
    const newPoint = {
      x: radarX / scale,
      y: radarY / scale
    };

    // Only add point if it's within the radar's valid range
    const maxRange = gridSize / 2;
    if (Math.abs(newPoint.x) <= maxRange && Math.abs(newPoint.y) <= maxRange) {
      setZonePoints(prev => [...prev, newPoint]);
      setTempZonePoints(prev => [...prev, newPoint]);
    } else {
      Alert.alert(
        "Invalid Point",
        "Please place points within the radar's range.",
        [{ text: "OK" }]
      );
    }
  };

  // Complete zone creation and send to server
  const handleZoneButtonPress = () => {
    if (!isCreatingZone) {
      // Start zone creation
      setIsCreatingZone(true);
      setZonePoints([]);
      setTempZonePoints([]);
    } else {
      // Complete zone creation and ask for name
      if (zonePoints.length >= 3) {
        setIsWaitingForName(true);
        setIsCreatingZone(false);
      } else {
        Alert.alert(
          "Invalid Zone",
          "A zone must have at least 3 points to be valid.",
          [{ text: "OK" }]
        );
      }
    }
  };

  const handleNameSubmit = (name) => {
    if (!name.trim()) {
      Alert.alert(
        "Invalid Name",
        "Zone name cannot be empty.",
        [{ text: "OK" }]
      );
      return;
    }

    // Check if name already exists
    if (zones.some(zone => zone.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert(
        "Name Already Exists",
        "Please choose a different name for this zone.",
        [{ text: "OK" }]
      );
      return;
    }

    // Create zone with custom name
    const zoneData = {
      id: `zone_${Date.now()}`,
      name: name.trim(),
      points: zonePoints
    };

    onZoneCreated(zoneData);
    setIsWaitingForName(false);
    setZonePoints([]);
    setTempZonePoints([]);
    setZoneName('');
  };

  const handleCancel = () => {
    setIsWaitingForName(false);
    setZonePoints([]);
    setTempZonePoints([]);
    setZoneName('');
  };

  // Optimize zone checking with useMemo
  const zoneStates = useMemo(() => {
    return zones.map(zone => ({
      id: zone.id,
      name: zone.name,
      points: zone.points,
      isActive: targets.some(target => isTargetInZone(target, zone))
    }));
  }, [zones, targets, isTargetInZone]);

  // Handle button press with animation
  const handleButtonPress = () => {
    // Scale down animation
    Animated.sequence([
      Animated.parallel([
        Animated.timing(buttonScale, {
          toValue: 0.9,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(buttonOpacity, {
          toValue: 0.8,
          duration: 100,
          useNativeDriver: true,
        })
      ]),
      // Scale up animation
      Animated.parallel([
        Animated.spring(buttonScale, {
          toValue: 1,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        })
      ])
    ]).start();

    if (!isCreatingZone) {
      // Start zone creation
      setIsCreatingZone(true);
      setZonePoints([]);
      setTempZonePoints([]);
    } else {
      // Complete zone creation
      if (zonePoints.length >= 3) {
        setIsWaitingForName(true);
        setIsCreatingZone(false);
      } else {
        Alert.alert(
          "Invalid Zone",
          "A zone must have at least 3 points to be valid.",
          [{ text: "OK" }]
        );
      }
    }
  };

  const renderZoneOverlay = () => {
    if (!isWaitingForName) return null;

    return (
      <>
        <View style={styles.modalOverlay} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.nameInputContainer}
          keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 40}
        >
          <Text style={styles.nameInputTitle}>Name Your Zone</Text>
          <TextInput
            style={styles.nameInput}
            placeholder="Enter zone name"
            placeholderTextColor="#666666"
            value={zoneName}
            onChangeText={setZoneName}
            autoFocus
            onSubmitEditing={() => handleNameSubmit(zoneName)}
          />
          <View style={styles.nameInputButtons}>
            <TouchableOpacity 
              style={[styles.nameInputButton, styles.cancelButton]}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.nameInputButton, styles.saveButton]}
              onPress={() => handleNameSubmit(zoneName)}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </>
    );
  };

  return (
    <View style={{ flex: 1, width: '100%', height: '100%' }}>
      <View style={[styles.radarContent, { padding: 10, paddingTop: 2 }]}>
        <Svg 
          width="100%" 
          height="100%" 
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMidYMid contain"
          onPress={handleRadarPress}
          style={{ overflow: 'hidden' }}
        >
          {/* Grid lines */}
          {Array.from({ length: gridSize + 1 }).map((_, i) => (
            <G key={`grid-${i}`}>
              <Line 
                x1={sensorX - (gridSize/2 * scale) + (i * scale)} 
                y1={sensorY} 
                x2={sensorX - (gridSize/2 * scale) + (i * scale)} 
                y2={svgHeight} 
                stroke="#e8e8e8" 
                strokeWidth="1" 
              />
              <Line 
                x1={10} 
                y1={sensorY + (i * scale)} 
                x2={svgWidth - 10} 
                y2={sensorY + (i * scale)} 
                stroke="#e8e8e8" 
                strokeWidth="1" 
              />
            </G>
          ))}
          
          {/* Radar sensor point */}
          <Circle cx={sensorX} cy={sensorY} r={8} fill="#5856D6" />
          <Circle cx={sensorX} cy={sensorY} r={12} fill="transparent" stroke="#5856D6" strokeWidth="2" opacity="0.6" />
          
          {/* Range markers */}
          {[1, 2, 3, 4].map((range) => (
            <Line
              key={`range-${range}`}
              x1={sensorX - (range * scale)}
              y1={sensorY + (range * scale)}
              x2={sensorX + (range * scale)}
              y2={sensorY + (range * scale)}
              stroke="#f0f0f0"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
          ))}
          
          {/* Range labels */}
          {[1, 2, 3, 4].map((range) => (
            <SvgText
              key={`label-${range}`}
              x={sensorX + (range * scale) + 5}
              y={sensorY + (range * scale) + 5}
              fill="#8e8e93"
              fontSize="10"
            >
              {range}m
            </SvgText>
          ))}

          {/* Draw zones with optimized rendering */}
          {zoneStates.map((zoneState) => {
            const points = zoneState.points.map(point => 
              `${sensorX + point.x * scale},${sensorY + point.y * scale}`
            ).join(' ');
            
            return (
              <G key={`zone-${zoneState.id}`}>
                <Polygon
                  points={points}
                  fill={zoneState.isActive ? "rgba(255, 59, 48, 0.1)" : "rgba(52, 199, 89, 0.1)"}
                  stroke={zoneState.isActive ? "#FF3B30" : "#34C759"}
                  strokeWidth="2"
                />
                <SvgText
                  x={sensorX + zoneState.points[0].x * scale}
                  y={sensorY + zoneState.points[0].y * scale - 10}
                  fill="#000000"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {zoneState.name}
                </SvgText>
              </G>
            );
          })}

          {/* Draw current zone being created */}
          {zonePoints.length > 0 && (
            <G>
              <Polyline
                points={zonePoints.map(point => 
                  `${sensorX + point.x * scale},${sensorY + point.y * scale}`
                ).join(' ')}
                stroke="#34C759"
                strokeWidth="2"
                fill="none"
              />
              {zonePoints.map((point, index) => (
                <Circle
                  key={`point-${index}`}
                  cx={sensorX + point.x * scale}
                  cy={sensorY + point.y * scale}
                  r={4}
                  fill="#34C759"
                />
              ))}
            </G>
          )}
          
          {/* Targets */}
          {targets.map((target, index) => {
            const svgX = sensorX + target.x * scale;
            const svgY = sensorY + target.y * scale;
            
            return (
              <G key={`target-${index}`}>
                {/* Target pulse effect */}
                <Circle
                  cx={svgX}
                  cy={svgY}
                  r={targetWidth * 2}
                  fill="rgba(88, 86, 214, 0.1)"
                  stroke="rgba(88, 86, 214, 0.3)"
                  strokeWidth="2"
                />
                <Circle
                  cx={svgX}
                  cy={svgY}
                  r={targetWidth * 1.5}
                  fill="rgba(88, 86, 214, 0.2)"
                  stroke="rgba(88, 86, 214, 0.4)"
                  strokeWidth="2"
                />
                
                {/* Target box */}
                <G>
                  {/* Background box */}
                  <Rect
                    x={svgX - targetWidth / 2}
                    y={svgY - targetHeight / 2}
                    width={targetWidth}
                    height={targetHeight}
                    fill="#5856D6"
                    opacity="0.9"
                    rx="2"
                    ry="2"
                  />
                  {/* Border */}
                  <Rect
                    x={svgX - targetWidth / 2}
                    y={svgY - targetHeight / 2}
                    width={targetWidth}
                    height={targetHeight}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1"
                    opacity="0.5"
                    rx="2"
                    ry="2"
                  />
                  {/* Highlight */}
                  <Rect
                    x={svgX - targetWidth / 2}
                    y={svgY - targetHeight / 2}
                    width={targetWidth}
                    height={targetHeight / 2}
                    fill="#ffffff"
                    opacity="0.2"
                    rx="2"
                    ry="2"
                  />
                </G>

                {/* Target info */}
                <G>
                  <SvgText
                    x={svgX}
                    y={svgY - targetHeight / 2 - 5}
                    fill="#000000"
                    fontSize="10"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    ID: {target.id}
                  </SvgText>
                  <SvgText
                    x={svgX}
                    y={svgY + targetHeight / 2 + 12}
                    fill="#8e8e93"
                    fontSize="8"
                    textAnchor="middle"
                  >
                    ({target.x.toFixed(2)}, {target.y.toFixed(2)})
                  </SvgText>
                </G>
              </G>
            );
          })}
        </Svg>
      </View>

      <Animated.View style={[
        styles.zoneButton,
        isCreatingZone && styles.zoneButtonActive
      ]}>
        <TouchableOpacity
          onPress={handleZoneButtonPress}
          style={styles.zoneButtonTouchable}
        >
          <Text style={styles.zoneButtonText}>+</Text>
        </TouchableOpacity>
      </Animated.View>
      {renderZoneOverlay()}
    </View>
  );
});

export default RadarVisualization; 