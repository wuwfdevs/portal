/** Whole dollars as people read them: 1200 becomes $1,200. Amounts on these pages are whole dollars; a cent is never shown or sent. */
export const formatMoney = (dollars: number): string => `$${Math.round(dollars).toLocaleString('en-US')}`
