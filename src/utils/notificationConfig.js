import { Platform } from 'react-native';

const configureNotifications = async () => {
  try {
    console.log('Notifications are not available in development mode');
    return;
  } catch (error) {
    console.error('Error configuring notifications:', error);
  }
};

export default configureNotifications; 