import { DMC } from "../engine/dmc.js";

// Russian color vocabulary, composed consistently from DMC's English names.
const words = {
  Alizarin:"ализариновый", Antique:"античный", Apple:"яблочный", Apricot:"абрикосовый", Aquamarine:"аквамариновый", Ash:"пепельный", Autumn:"осенний", Avocado:"авокадовый", Baby:"детский", Beaver:"бобровый", Beige:"бежевый", Black:"чёрный", Blossom:"цветущий", Blue:"синий", Blueberry:"черничный", Bright:"яркий", Brown:"коричневый", Burnt:"жжёный", Canary:"канареечный", Carnation:"гвоздичный", Celadon:"селадоновый", Chartreuse:"шартрёз", Cocoa:"какао", Coffee:"кофейный", Copper:"медный", Coral:"коралловый", Cornflower:"васильковый", Cotta:"терракотовый", Cranberry:"клюквенный", Cream:"кремовый", Cyclamen:"цикламеновый", Dark:"тёмный", Darkv:"тёмный", Deep:"насыщенный", Delft:"дельфтский", Desert:"пустынный", Drab:"тусклый", Driftwood:"цвета плавника", Dusty:"пыльный", Ecru:"экрю", Eggplant:"баклажанный", Electric:"электрический", Emerald:"изумрудный", Fern:"папоротниковый", Forest:"лесной", Fuschia:"фуксиевый", Garnet:"гранатовый", Geranium:"гераниевый", Gold:"золотой", Golden:"золотистый", Grape:"виноградный", Gray:"серый", Green:"зелёный", Grn:"зелёный", Hazelnut:"ореховый", Hunter:"охотничий", Jade:"нефритовый", Kelly:"травяной", Khaki:"хаки", Lavender:"лавандовый", Lemon:"лимонный", Light:"светлый", Mahogany:"красного дерева", Mauve:"лиловый", Medium:"средний", Melon:"дынный", Mocha:"мокко", Moss:"мшистый", Mustard:"горчичный", Navy:"тёмно-синий", Nile:"нильский", Off:"молочный", Old:"старинный", Olive:"оливковый", Orange:"оранжевый", Pale:"бледный", Parrot:"попугайный", Peach:"персиковый", Peacock:"павлиний", Pearl:"жемчужный", Pewter:"оловянно-серый", Pine:"сосновый", Pink:"розовый", Pistachio:"фисташковый", Plum:"сливовый", Pumpkin:"тыквенный", Raspberry:"малиновый", Red:"красный", Rose:"розовый", Rosewood:"палисандровый", Royal:"королевский", Salmon:"лососёвый", Sand:"песочный", Sea:"морской", Shell:"ракушечный", Shrimp:"креветочный", Sky:"небесный", Snow:"снежный", Spice:"пряный", Steel:"стальной", Straw:"соломенный", Tan:"рыжевато-коричневый", Tangerine:"мандариновый", Tawny:"рыжий", Teal:"сине-зелёный", Tender:"нежный", Terra:"терракотовый", Tin:"оловянный", Topaz:"топазовый", Turquoise:"бирюзовый", Ultra:"очень", VD:"очень тёмный", Very:"очень", Violet:"фиолетовый", Vy:"очень", Wedgewood:"веджвудский", White:"белый", Winter:"зимний", Yellow:"жёлтый", medium:"средний",
};
const compounds = [
  [/Apple Green/g, "яблочно-зелёный"], [/Avocado (?:Green|Grn)/g, "авокадово-зелёный"],
  [/Beaver Gray/g, "боброво-серый"], [/Beige Brown/g, "бежево-коричневый"], [/Beige Gray/g, "бежево-серый"],
  [/Blue Gray/g, "сине-серый"], [/Blue Green/g, "сине-зелёный"], [/Blue Violet/g, "сине-фиолетовый"],
  [/Brown Gray/g, "коричнево-серый"], [/Burnt Orange/g, "жжёно-оранжевый"], [/Celadon Green/g, "селадоново-зелёный"],
  [/Coffee Brown/g, "кофейно-коричневый"], [/Cornflower Blue/g, "васильково-синий"], [/Cyclamen Pink/g, "цикламеново-розовый"],
  [/Desert Sand/g, "пустынно-песочный"], [/Drab Brown/g, "тускло-коричневый"], [/Dusty Rose/g, "пыльно-розовый"],
  [/Emerald Green/g, "изумрудно-зелёный"], [/Fern Green/g, "папоротниково-зелёный"], [/Golden Brown/g, "золотисто-коричневый"],
  [/Golden Olive/g, "золотисто-оливковый"], [/Hazelnut Brown/g, "орехово-коричневый"], [/Hunter Green/g, "тёмно-зелёный"],
  [/Khaki Green/g, "хаки-зелёный"], [/Lavender Blue/g, "лавандово-синий"], [/Moss Green/g, "мшисто-зелёный"],
  [/Navy Blue/g, "тёмно-синий"], [/Nile Green/g, "нильско-зелёный"], [/Olive Green/g, "оливково-зелёный"],
  [/Peacock Blue/g, "павлиний синий"], [/Pearl Gray/g, "жемчужно-серый"], [/Pewter Gray/g, "оловянно-серый"],
  [/Pine Green/g, "сосново-зелёный"], [/Pistachio (?:Green|Grn)/g, "фисташково-зелёный"], [/Royal Blue/g, "королевский синий"],
  [/Sea Green/g, "морской зелёный"], [/Shell Gray/g, "ракушечно-серый"], [/Shell Pink/g, "ракушечно-розовый"],
  [/Sky Blue/g, "небесно-синий"], [/Steel Gray/g, "стально-серый"], [/Teal Green/g, "бирюзово-зелёный"],
  [/Tender Green/g, "нежно-зелёный"], [/Yellow Beige/g, "жёлто-бежевый"], [/Yellow Green/g, "жёлто-зелёный"],
  [/Yellow Pale/g, "бледно-жёлтый"], [/Yellow Plum/g, "жёлто-сливовый"], [/Green Bright/g, "ярко-зелёный"], [/Kelly Green/g, "травяной зелёный"], [/Chartreuse Bright/g, "яркий жёлто-зелёный"],
  [/Turquoise Bright/g, "ярко-бирюзовый"], [/Antique Blue/g, "старинный синий"], [/Antique Mauve/g, "старинный лиловый"],
  [/Antique Violet/g, "старинный фиолетовый"], [/Baby Blue/g, "нежно-голубой"], [/Baby Pink/g, "нежно-розовый"],
  [/Autumn Gold/g, "осеннее золото"], [/Delft Blue/g, "дельфтский синий"], [/Electric Blue/g, "ярко-синий"],
  [/Forest Green/g, "лесной зелёный"], [/Old Gold/g, "старое золото"], [/Mocha Beige/g, "бежевый мокко"],
  [/Mocha Brown/g, "мокко-коричневый"], [/Peacock Blue/g, "павлиний синий"], [/Terra Cotta/g, "терракотовый"],
  [/Snow White/g, "снежно-белый"], [/Black Brown/g, "чёрно-коричневый"], [/Off White/g, "молочно-белый"], [/Red Copper/g, "красно-медный"],
];
// Degrés DMC : Light < Very Light < Ultra Light < Ultra Very Light (idem Dark) — chaque degré garde un nom distinct.
const degrees = [
  [/Darkv/g, "Dark"], [/\s+/g, " "],
  [/Ultra Very Light/g, "сверхсветлый"], [/Ultra Very Dark/g, "сверхтёмный"],
  [/Ultra Light/g, "ультрасветлый"], [/Ultra Dark/g, "ультратёмный"],
];
const phrase = (name) => compounds.reduce(
  (text, [pattern, translation]) => text.replace(pattern, translation),
  degrees.reduce((text, [pattern, translation]) => text.replace(pattern, translation), name),
)
  .replace(/Parrot Green/g, "попугайно-зелёный")
  .replace(/Pewter Gray/g, "оловянно-серый")
  .replace(/Gray Green/g, "серо-зелёный")
  .replace(/Gray Blue/g, "серо-синий")
  .replace(/Green Gray/g, "зелёно-серый")
  .replace(/Very Dark/g, "очень тёмный")
  .split(/\s+/)
  .map((word) => words[word] || word)
  .join(" ")
  .replace(/очень светлый/g, "очень светлый")
  .replace(/светлый очень тёмный/g, "очень тёмный");
const translated = DMC.map(([code, name]) => [code, phrase(name)]);
const seenNames = new Set();
export const DMC_NAMES_RU = Object.fromEntries(translated.map(([code, name]) => {
  let unique = name;
  if (seenNames.has(unique)) unique = `${name} (${code})`;
  seenNames.add(unique);
  return [code, unique];
}));
export const dmcNameRu = (code, fallback = "") => DMC_NAMES_RU[code] || fallback;
export const dmcSearchText = (code, english) => `${code} ${dmcNameRu(code, english)} ${english}`;
