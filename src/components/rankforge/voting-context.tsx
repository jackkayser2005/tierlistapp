"use client";

import * as React from "react";

interface VotingContextValue {
  votingMode: boolean;
  setVotingMode: (v: boolean) => void;
}

const VotingContext = React.createContext<VotingContextValue>({
  votingMode: false,
  setVotingMode: () => {},
});

export function VotingModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [votingMode, setVotingMode] = React.useState(false);
  const value = React.useMemo(
    () => ({ votingMode, setVotingMode }),
    [votingMode]
  );
  return (
    <VotingContext.Provider value={value}>{children}</VotingContext.Provider>
  );
}

export function useVotingMode() {
  return React.useContext(VotingContext);
}
