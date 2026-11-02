import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { ContractDetail } from "@/lib/underwriting/queries";
import { cancelFlight, createFlight } from "../../contract-actions";

/** The bottom of the Schedule tab: the order's flights, closed when it has none. */
export function FlightsSection({ contract }: { contract: ContractDetail }) {
  const count = contract.flights.length;
  return (
    <details id="flights" open={count > 0} className="scroll-mt-4 rounded border border-line">
      <summary className="cursor-pointer px-5 py-3.5 text-sm font-bold text-ink-900">
        Flights{" "}
        <span className="font-normal text-ink-500">
          · {count === 0 ? "none on this order" : count}
        </span>
      </summary>
      {count === 0 ? (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-500">
          No flights — add one for each concert, production, or event the order groups its dates and
          copy under.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {contract.flights.map((flight) => (
            <li
              key={flight.id}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
            >
              <span>
                <span className="font-semibold text-ink-900">{flight.name}</span>
                <span className="ml-2 text-xs text-ink-400">
                  {flight.start_date} – {flight.end_date}
                </span>
                {flight.status === "cancelled" && (
                  <Badge variant="danger" className="ml-2">
                    cancelled
                  </Badge>
                )}
              </span>
              {flight.status === "active" && (
                <form action={cancelFlight} className="flex items-center gap-2">
                  <input type="hidden" name="contract_id" value={contract.id} />
                  <input type="hidden" name="flight_id" value={flight.id} />
                  <Input
                    name="cancelled_from"
                    type="date"
                    defaultValue={flight.start_date}
                    className="max-w-[160px]"
                    aria-label={`Cancel ${flight.name} from`}
                  />
                  <Button type="submit" variant="ghost">
                    Cancel flight
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        action={createFlight}
        className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-4"
      >
        <input type="hidden" name="contract_id" value={contract.id} />
        <div>
          <Label htmlFor="flight_name">Name</Label>
          <Input id="flight_name" name="name" placeholder="El Mesias — Dec 4 & 5" />
        </div>
        <div>
          <Label htmlFor="flight_start">From</Label>
          <Input id="flight_start" name="start_date" type="date" />
        </div>
        <div>
          <Label htmlFor="flight_end">To</Label>
          <Input id="flight_end" name="end_date" type="date" />
        </div>
        <Button type="submit" variant="secondary">
          Add flight
        </Button>
      </form>
    </details>
  );
}
