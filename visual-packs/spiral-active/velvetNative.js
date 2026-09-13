import React from 'react';
import { Platform, UIManager, View, requireNativeComponent } from 'react-native';

export const velvetAvailable = Platform.OS === 'android' && Boolean(UIManager.getViewManagerConfig?.('MetraVelvetView'));
const NativeVelvet = velvetAvailable ? requireNativeComponent('MetraVelvetView') : null;
export function VelvetArt(props) {
  return NativeVelvet ? <NativeVelvet {...props} /> : <View style={props.style} />;
}
