import React from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
export const SPIRAL_VIEWBOX = 120;

function buildSpiralGeometry() {
  const cx = SPIRAL_VIEWBOX / 2;
  const cy = SPIRAL_VIEWBOX / 2;
  const turns = 2.55;
  const steps = 180;
  const minRadius = 3;
  const maxRadius = 49;
  let d = '';
  let length = 0;
  let previous = null;

  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const angle = (-Math.PI / 2) + (ratio * Math.PI * 2 * turns);
    const radius = minRadius + ((maxRadius - minRadius) * ratio);
    const x = cx + (Math.cos(angle) * radius);
    const y = cy + (Math.sin(angle) * radius);
    d += `${index === 0 ? 'M' : ' L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    if (previous) length += Math.hypot(x - previous.x, y - previous.y);
    previous = { x, y };
  }

  return { d, length: Math.ceil(length) };
}

const GEOMETRY = buildSpiralGeometry();
export const SPIRAL_PATH = GEOMETRY.d;
export const SPIRAL_PATH_LENGTH = GEOMETRY.length;

export function SpiralSvg({
  size = 120,
  strokeWidth = 7,
  dashOffset = 0,
  opacity = 1,
  showCenter = true,
  testID,
}) {
  return (
    <Svg testID={testID} width={size} height={size} viewBox={`0 0 ${SPIRAL_VIEWBOX} ${SPIRAL_VIEWBOX}`} opacity={opacity}>
      <Defs>
        <LinearGradient id="metraSpiralGradient" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F26426" />
          <Stop offset="0.48" stopColor="#F5B51B" />
          <Stop offset="1" stopColor="#6AAB45" />
        </LinearGradient>
      </Defs>
      <AnimatedPath
        d={SPIRAL_PATH}
        fill="none"
        stroke="url(#metraSpiralGradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${SPIRAL_PATH_LENGTH} ${SPIRAL_PATH_LENGTH}`}
        strokeDashoffset={dashOffset}
      />
      {showCenter ? <Circle cx="60" cy="57" r="4.8" fill="#F26426" /> : null}
    </Svg>
  );
}
