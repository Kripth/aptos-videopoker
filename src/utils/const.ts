export enum Value {
	two = 0,
	three,
	four,
	five,
	six,
	seven,
	eight,
	nine,
	ten,
	jack,
	queen,
	king,
	ace
}

export enum Suit {
	hearts = 0b000000,
	diamonds = 0b010000,
	clubs = 0b100000,
	spades = 0b110000
}

export const Results = [
	"Jacks or better",
	"Two pair",
	"Three of a kind",
	"Straight",
	"Flush",
	"Full house",
	"Four of a kind",
	"Straight flush",
	"Royal flush"
];
