import { MathUtils } from 'three';

export const getStarRandomHexColor = (theme: string = 'dark') => {
  const darkStar = [
    // 0x009dff, // Example color 1
    // 0x001aff, // Example color 2
    // 0x4000ff, // Example color 3
    // 0x7300ff, // Example color 4
    0xff0000,
  ];

  const brightStar = [0x4a6b90, 0x8fc5c1, 0xe6ffed, 0x967098, 0xffd7d7];

  const predefinedStarColorList = theme === 'dark' ? brightStar : darkStar;

  const randomIndex = Math.floor(
    MathUtils.randFloat(0, predefinedStarColorList.length - 1),
  );
  const randomColorHex = predefinedStarColorList[randomIndex];

  return randomColorHex;
};
