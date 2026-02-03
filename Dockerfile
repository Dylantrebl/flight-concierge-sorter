# Flight Concierge Sorter - fetches Skyscanner + Kayak with Playwright, then filter+sort
FROM apify/actor-node-playwright-chrome:20

COPY package*.json ./

RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional \
    && echo "Installed npm packages:" \
    && (npm list --all || true)

COPY . ./
