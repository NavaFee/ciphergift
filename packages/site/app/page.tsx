import { ConnectHero } from "~~/components/screens/ConnectHero";

/**
 * Landing page. If the user is already connected, the ConnectHero
 * client component redirects to /dashboard automatically.
 */
export default function Home() {
  return <ConnectHero />;
}
