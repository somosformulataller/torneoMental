import { CARD_DATA } from './cardThemes';

export function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export function generateCardPairs(themeId, count) {
  // Ensure count is even and >= 14
  const validCount = Math.max(14, count % 2 === 0 ? count : count + 1);
  const pairCount = validCount / 2;

  const themeCards = CARD_DATA[themeId] || CARD_DATA['tecnologia'];
  
  // Select random cards from theme
  const selectedCards = shuffleArray(themeCards).slice(0, pairCount);
  
  // Duplicate to create pairs
  const pairs = [];
  selectedCards.forEach((card, index) => {
    // We add a unique pairId to match them later
    const cardInstance1 = { ...card, pairId: card.id, uniqueId: `${card.id}-1` };
    const cardInstance2 = { ...card, pairId: card.id, uniqueId: `${card.id}-2` };
    pairs.push(cardInstance1, cardInstance2);
  });
  
  return shuffleArray(pairs);
}
