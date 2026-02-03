# Flight Concierge Sorter - custom Apify actor
FROM apify/actor-node:20

COPY package*.json ./

RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional \
    && echo "Installed npm packages:" \
    && (npm list --all || true)

COPY . ./
