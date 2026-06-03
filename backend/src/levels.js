// 15 уровней: персонаж + здание позади + экономика здания
export const LEVELS = Array.from({ length: 15 }).map((_, i) => {
  const L = i + 1;
  const buildingCost = Math.round(200 * Math.pow(1.8, L - 1));
  const buildingIncomePerHour = Math.round(30 * Math.pow(1.6, L - 1));

  return {
    level: L,
    title: [
      "Почтальон-стажёр",
      "Почтальон",
      "Оператор окна",
      "Старший оператор",
      "Сортировщик",
      "Старший сортировщик",
      "Начальник смены",
      "Супервайзер зала",
      "Зам. начальника отделения",
      "Начальник отделения",
      "Координатор районов",
      "Руководитель направления",
      "Зам. директора",
      "Директор",
      "Генеральный директор Главпочтамта"
    ][i],
    // Заглушки под ассеты (заменишь на реальные файлы/URL)
    characterAsset: `character_${L}.png`,
    backgroundAsset: `building_${L}.png`,
    buildingCost,
    buildingIncomePerHour
  };
});
