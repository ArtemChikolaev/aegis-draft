# Liquipedia API access — application draft

Official application: https://liquipedia.net/api

## Before submitting

Confirm these facts; do not state them inaccurately:

- public repository URL and license;
- whether Aegis Draft is non-commercial and has no betting/virtual-currency gambling;
- planned public site URL, if any;
- applicant full name, contact email and country;
- whether generated data or source-derived fields will be redistributed.

## Copy-ready project description

> Aegis Draft is a Dota 2 roster-drafting roguelite. Its offline Go ETL combines OpenDota match statistics with authorized Liquipedia tournament, placement, team and roster metadata. The generated static game dataset powers draft gameplay; end users never query Liquipedia at runtime. We cache source responses, obey the rate limits and authentication scheme issued with access, and show Liquipedia/CC BY-SA attribution in both the dataset manifest and the UI. The product does not replicate Liquipedia's browsing experience and does not use Liquipedia for betting.

Add this sentence only if true:

> The project is open-source at `<REPOSITORY_URL>`, licensed under `<LICENSE>`, and is non-commercial.

## Requested data

- Dota 2 tournaments: stable id, name, tier, start/end dates, patch/edition.
- Placements and prize data by tournament/team.
- Teams: stable id, name, tag and logo metadata/license reference.
- Rosters per tournament: player identity, nickname and listed role when available.
- Transfers/history only if required to resolve a player who represented multiple teams inside a rating window.

We do **not** request live user traffic, betting data, wiki HTML scraping or a replica of Liquipedia pages.

## Technical safeguards already implemented

- API base URL, auth header/value and rate limit are configuration supplied by Liquipedia, never guessed.
- Credentials stay in ignored environment files; secrets are redacted from errors.
- Shared rate-limited client honors `429`, `5xx` and `Retry-After`.
- Raw responses are cached; repeat pipeline runs do not spend API budget.
- Source attribution is preserved in `manifest.source` and is required in the future UI footer.

## After approval

Store credentials locally (exact variable names will follow the issued auth scheme), then implement typed DTOs from the supplied OpenAPI document. Do not paste credentials into chat or commit them.
