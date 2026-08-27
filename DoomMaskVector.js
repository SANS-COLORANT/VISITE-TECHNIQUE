import React from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { DOOM_MASK_PATHS_1 } from './DoomMaskPaths1.js';
import { DOOM_MASK_PATHS_2 } from './DoomMaskPaths2.js';
import { DOOM_MASK_PATHS_3 } from './DoomMaskPaths3.js';
import { DOOM_MASK_PATHS_4 } from './DoomMaskPaths4.js';
import { DOOM_MASK_PATHS_5 } from './DoomMaskPaths5.js';
import { DOOM_MASK_PATHS_6 } from './DoomMaskPaths6.js';
import { DOOM_MASK_PATHS_7 } from './DoomMaskPaths7.js';
import { DOOM_MASK_PATHS_8 } from './DoomMaskPaths8.js';

const MASK_PATHS = [
  ...DOOM_MASK_PATHS_1,
  ...DOOM_MASK_PATHS_2,
  ...DOOM_MASK_PATHS_3,
  ...DOOM_MASK_PATHS_4,
  ...DOOM_MASK_PATHS_5,
  ...DOOM_MASK_PATHS_6,
  ...DOOM_MASK_PATHS_7,
  ...DOOM_MASK_PATHS_8,
];

export function DoomMaskVector({ width = '100%', height = '100%' }) {
  return (
    <Svg width={width} height={height} viewBox="548.328 542.222 160.168 155.778">
      <G transform="matrix(0.442049 0 0 0.442049 462.176209 495.453136)">
        {MASK_PATHS.map((item, index) => (
          <Path key={index} d={item.d} fill={item.fill} />
        ))}
      </G>
    </Svg>
  );
}
