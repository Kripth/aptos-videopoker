import { useEffect, useRef, useState } from "react";
import Cards from "./Cards";
import ContractForm from "./ContractForm";
import * as audio from "../util/audio";
import { changedToFlipped } from "../util/cards";
import { Results } from "../util/const";
import { toBigInt, formatNumber } from "../util/format";
import "../styles/play.scss";
import Error from "./Error";

const ALL_FLIPPED = Array(5).fill(true);
const NONE_FLIPPED = Array(5).fill(false);

/**
 * @param {string} address
 * @param {number} resume
 * @returns {JSX.Element}
 */
export default function Play({ address, resume }) {

	const bet = useRef();
	const cardsWrapper = useRef();

	const [ active, setActive ] = useState(true);

	const [ contract, setContract ] = useState(null);

	const [ playing, setPlaying ] = useState(null);
	const [ loading, setLoading ] = useState(false);

	const [ unit, setUnit ] = useState("");
	const [ balance, setBalance ] = useState(undefined);

	const [ cards, setCards ] = useState(0);
	const [ flipped, setFlipped ] = useState(ALL_FLIPPED);

	const [ result, setResult ] = useState(null);
	const [ error, setError ] = useState(null);

	const [ id ] = useState(Math.random());

	useEffect(() => {
		return () => setActive(false);
	}, []);

	async function ifActive(promise) {
		await promise;
		if(!active) {
			throw new Error("Component is no longer active");
		}
		return promise;
	}

	function updateImpl(contract) {
		return Promise.all([
			contract.updateBalance().then(value => {
				setBalance(value);
				return value;
			}),
			contract.updateMin(),
			contract.updateMax()
		]);
	}

	function update() {
		return updateImpl(contract);
	}

	async function initContract(contract, info) {
		if(contract) {
			await ifActive(updateImpl(contract));
			const { unit } = info;
			setUnit(unit || "");
			//TODO convert prices with coingecko API
			// calculate optimal bet
			let best = contract.balance / 10n;
			if(best > contract.max) best = contract.max;
			else if(best < contract.min) best = contract.min;
			bet.current.value = formatNumber(best, 5);
			// update hash
			window.location.hash = `#play/${info.address}`;
			// resume game
			if(resume) {
				const game = await ifActive(contract.getGame(resume));
				const change = game.change > 0;
				if(game.playable || change) {
					bet.current.value = formatNumber(game.bet);
					setCards(game.cards);
					setPlaying(game.id);
					if(change) {
						setFlipped(changedToFlipped(game.change));
						setLoading(true); // mark game as started
						if(!game.finished) {
							handleStart(game.bet, contract.startEvent(game.id));
						} else {
							handleEnd(contract.endEvent(game.id));
						}
					} else {
						setFlipped(NONE_FLIPPED);
					}
				}
			}
		} else {
			bet.current.value = "";
		}
		setContract(contract);
	}

	async function setMinBet() {
		await update();
		bet.current.value = formatNumber(contract.min);
	}

	async function setMaxBet() {
		const [ gas ] = await Promise.all([contract.getGasPrice(), update()]);
		const balance = contract.balance - gas * 310000n;
		bet.current.value = formatNumber(contract.max < balance ? contract.max : balance);
	}

	async function start(data) {
		const bet = toBigInt(data.get("bet"));
		await ifActive(update());
		if(bet > contract.max) {
			throw new Error("Bet too high");
		} else if(bet < contract.min) {
			throw new Error("Bet too low");
		} else if(bet > contract.balance) {
			throw new Error("Insufficient balance");
		} else {
			const previouslyFlipped = flipped;
			setFlipped(ALL_FLIPPED);
			setResult(null);
			await handleStart(bet, contract.start(bet).finally(() => {
				if(active) {
					// restore to previous game in case of cancel/fail
					setFlipped(previouslyFlipped);
				}
			}));
		}
	}

	async function handleStart(bet, promise) {
		const { gameId, cards } = await ifActive(promise);
		// make sure no cards are selected
		for(const input of cardsWrapper.current.querySelectorAll(":checked")) {
			input.checked = false;
		}
		setCards(cards);
		setFlipped(NONE_FLIPPED);
		setBalance(balance - bet);
		setPlaying(gameId);
		setLoading(false);
		audio.draw();
	}

	async function end(data) {
		let replace = 0;
		const flipped = [];
		for(let i=0; i<5; i++) {
			if(!data.get("card" + i)) {
				replace |= 1 << i;
				flipped[i] = 1;
			}
		}
		setFlipped(flipped);
		await handleEnd(contract.end(playing, replace).finally(() => {
			// all cards must be visible again when the transaction ends, is cancelled or fails
			setFlipped(NONE_FLIPPED);
		}));
	}

	async function handleEnd(promise) {
		const { cards, result, payout } = await ifActive(promise);
		const index = +result;
		if(index) {
			if(payout > 0) {
				// update balance
				setBalance(balance + BigInt(payout));
			}
			setResult({ index, payout });
			audio.win();
		} else {
			setResult(null);
			audio.loss();
		}
		setCards(Number(BigInt(cards) & 68719476735n)); //FIXME fix event in solidity
		setFlipped(NONE_FLIPPED);
		setPlaying(null);
		setLoading(false);
	}

	async function submit(event) {
		event.preventDefault();
		setError(null);
		setLoading(true);
		try {
			await (playing ? end : start)(new FormData(event.target));
		} catch(e) {
			if(active) {
				setError(e.message);
				audio.error();
				setLoading(false);
			} else {
				console.warn("Error thrown on inactive component", e);
			}
		}
	}

	useEffect(() => {
		if(contract) {
			const interval = setInterval(update, 30000);
			return () => clearInterval(interval);
		}
	}, [contract]);

	return <div className="play-component">
		<ContractForm address={address} setError={setError} setContract={initContract} />
		<form onSubmit={submit}>
			<fieldset disabled={loading || !contract}>
				<div className="row">
					<label htmlFor="input-balance" className="label">Balance</label>
					<div className="value">
						<input id="input-balance" disabled={true} value={balance >= 0n ? `${formatNumber(balance)} ${unit}` : ""} />
					</div>
				</div>
				<div className="row">
					<label htmlFor="input-bet" className="label">Bet</label>
					<fieldset className="value group" disabled={!!playing}>
						<input ref={bet} id="input-bet" name="bet" spellCheck={false} />
						<button type="button" onClick={setMinBet}>Min</button>
						<button type="button" onClick={setMaxBet}>Max</button>
					</fieldset>
				</div>
				<fieldset ref={cardsWrapper} className="row play-component-cards" disabled={!playing}>
					<Cards cards={cards} flipped={flipped} />
				</fieldset>
				<div className="row">
					<button type="submit" className={`play-component-play-button${loading ? " loading" : ""}`}>
						{playing ? "Draw" : "Deal"}
					</button>
				</div>
				{result && <div className="row">
					<div className="play-component-result">
						<div>{Results[result.index - 1]}</div>
						<div className="amount">+{formatNumber(result.payout)} {unit}</div>
					</div>
				</div>}
				{error && <div className="row"><Error error={error} /></div>}
			</fieldset>
		</form>
	</div>

}
