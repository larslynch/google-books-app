This is a [Next.js](https://nextjs.org) project.

## Getting Started

1. Get a key from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

2. Create a `.env.local` file in the project root and add your Google Books API key:

```
GOOGLE_BOOKS_API_KEY=your_api_key_here
```

3. Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Features

- **Search** - Search for books using the Google Books API
- **Cached paging** - Browse results with pagination backed by caching for smooth navigation
