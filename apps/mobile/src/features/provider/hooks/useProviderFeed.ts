import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { Demand, User } from '@rubli/shared';
import { apiListProviderOpportunities } from '../../../api/client';

export function useProviderFeed(user: User | null, demands: Demand[], latitude?: number, longitude?: number, radius = 10) {
  const [remoteFeed, setRemoteFeed] = useState<Array<{ demand: Demand; distanceKm?: number }> | null>(null);
  useEffect(() => {
    let active = true;
    if (!user || user.role !== 'provider') { setRemoteFeed(null); return; }
    const refreshFeed = () => {
      apiListProviderOpportunities().then((result) => {
        if (active) setRemoteFeed(result.items.map((demand) => ({ demand, distanceKm: demand.distanceKm })));
      }).catch(() => { if (active) setRemoteFeed(null); });
    };

    // Um push pode chegar enquanto o WebSocket está suspenso pelo sistema.
    // Ao voltar ao primeiro plano (e em intervalos curtos enquanto aberto),
    // buscamos novamente a lista autenticada: o servidor continua sendo a
    // única fonte de verdade para categoria, raio e disponibilidade.
    refreshFeed();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshFeed();
    });
    const refreshTimer = setInterval(refreshFeed, 15_000);
    return () => {
      active = false;
      appStateSubscription.remove();
      clearInterval(refreshTimer);
    };
  }, [user?.id, user?.serviceCategories?.join('|'), user?.serviceCategoryIds?.join('|'), user?.serviceLatitude, user?.serviceLongitude, user?.serviceRadiusKm, user?.isAvailable, demands.map((demand) => `${demand.id}:${demand.updatedAt}`).join('|')]);

  return useMemo(() => {
    if (!user || user.role !== 'provider') return [] as Array<{ demand: Demand; distanceKm?: number }>;
    // Chamados já contratados não são devolvidos pelo endpoint de oportunidades
    // (corretamente), mas precisam continuar visíveis na área de Demandas.
    // Eles vêm da listagem autenticada e nunca passam novamente pelo matching.
    const contracted = demands
      .filter((demand) => demand.acceptedProviderId === user.id && demand.status !== 'cancelled')
      .map((demand) => ({ demand }));
    if (remoteFeed) {
      const newOpportunities = remoteFeed.filter((item) => !contracted.some((itemContract) => itemContract.demand.id === item.demand.id));
      return [...contracted, ...newOpportunities];
    }
    // Uma falha de rede não deve transformar o cache em uma segunda fonte de
    // elegibilidade. Sem resposta do servidor, o feed fica vazio até a próxima
    // atualização autenticada, preservando o servidor como fonte de verdade.
    return contracted;
  }, [demands, latitude, longitude, radius, remoteFeed, user]);
}
