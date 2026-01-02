// Helper function to paginate backstory text intelligently
export const paginateBackstory = (text: string, wordsPerPage: number = 500): string[] => {
  if (!text || text.trim().length === 0) return [];
  
  // Split by paragraphs (double newlines or single newlines)
  const paragraphs = text.split(/\n\s*\n|\n/).filter(p => p.trim().length > 0);
  const pages: string[] = [];
  let currentPage: string[] = [];
  let wordCount = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    const paragraphWords = paragraph.split(/\s+/).length;
    
    // If this single paragraph is longer than the word limit, it gets its own page
    if (paragraphWords > wordsPerPage) {
      // Save current page if it has content
      if (currentPage.length > 0) {
        pages.push(currentPage.join('\n\n'));
        currentPage = [];
      }
      // Put the long paragraph on its own page
      pages.push(paragraph);
      wordCount = 0;
    }
    // If adding this paragraph would exceed the word limit
    else if (wordCount + paragraphWords > wordsPerPage && currentPage.length > 0) {
      // Save current page and start a new one
      pages.push(currentPage.join('\n\n'));
      currentPage = [paragraph];
      wordCount = paragraphWords;
    } else {
      // Add paragraph to current page
      currentPage.push(paragraph);
      wordCount += paragraphWords;
    }
  }
  
  // Add any remaining paragraphs as the final page
  if (currentPage.length > 0) {
    pages.push(currentPage.join('\n\n'));
  }
  
  return pages;
};

// Calculate character health totals
export const calculateCharacterHealth = (character: any): { current: number; max: number; percentage: number } => {
  const limbHealth = character.limb_health || {};
  const maxHealth = Object.values(limbHealth).reduce((sum: number, val: any) => {
    const numVal = typeof val === 'number' ? val : parseInt(val) || 0;
    return sum + numVal;
  }, 0);
  
  const currentHealth = Object.entries(limbHealth).reduce((sum: number, [key, maxVal]: [string, any]) => {
    const currentKey = `current_${key}`;
    const currentVal = character[currentKey];
    const current = typeof currentVal === 'number' ? currentVal : parseInt(currentVal) || 0;
    return sum + current;
  }, 0);
  
  const percentage = maxHealth > 0 ? (currentHealth / maxHealth) * 100 : 0;
  
  return {
    current: currentHealth,
    max: maxHealth,
    percentage
  };
};
