import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Vibration, Platform } from 'react-native';

const FallAlert = ({ visible, onClose }) => {
  const [showAlert, setShowAlert] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShowAlert(true);
      // Vibrate
      Vibration.vibrate([1000, 1000], true);
    } else {
      setShowAlert(false);
      Vibration.cancel();
    }
  }, [visible]);

  const handleClose = () => {
    setShowAlert(false);
    Vibration.cancel();
    onClose();
  };

  return (
    <Modal
      visible={showAlert}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.alertBox}>
          <Text style={styles.title}>Fall Detected!</Text>
          <Text style={styles.message}>A fall has been detected. Please check the situation immediately.</Text>
          <TouchableOpacity style={styles.button} onPress={handleClose}>
            <Text style={styles.buttonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  alertBox: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF3B30',
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    color: '#333333',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default FallAlert; 