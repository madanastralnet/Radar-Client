import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Dimensions } from 'react-native';
import { styles } from '../styles/styles';

const { width } = Dimensions.get('window');

const SplashScreen = ({ navigation }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const moveAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animation sequence
    Animated.sequence([
      // Initial fade in and scale up
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        })
      ]),
      
      // Hold for a longer moment
      Animated.delay(2500),
      
      // Move up and fade out
      Animated.parallel([
        Animated.timing(moveAnim, {
          toValue: -50,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        })
      ])
    ]).start(() => {
      navigation.replace('Main');
    });
  }, []);

  return (
    <View style={styles.splashContainer}>
      <Animated.View
        style={[
          styles.animatedContainer,
          {
            opacity: fadeAnim,
            transform: [
              { scale: scaleAnim },
              { translateY: moveAnim }
            ]
          }
        ]}
      >
        {/* Brand Name */}
        <View style={styles.brandContainer}>
          <Text style={styles.brandName}>Sentinel</Text>
          <Text style={styles.brandSubtitle}>by SanAura</Text>
        </View>
      </Animated.View>
    </View>
  );
};

export default SplashScreen; 