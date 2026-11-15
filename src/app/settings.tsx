import { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { invalidateListCache } from '@/components/list-picker';
import { BusyOverlay, Button, Card, Field, Icon, PromptModal, T } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { signIn, signOut } from '@/lib/anylist/client';
import { listRecipes } from '@/lib/db';
import { formatUsd } from '@/lib/pricing';
import { getAnthropicKey, setAnthropicKey, useAnyListSession } from '@/lib/settings';
import { setBalance, useSpending } from '@/lib/spending';
import { describeImport, importShareFile, shareRecipes } from '@/lib/share';

export default function Settings() {
  const t = useTheme();
  const anylist = useAnyListSession();
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [balancePrompt, setBalancePrompt] = useState(false);
  const spending = useSpending();

  useEffect(() => {
    getAnthropicKey().then(setSavedKey);
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveKey() {
    const k = key.trim();
    if (!k.startsWith('sk-ant-')) {
      Alert.alert('That doesn’t look like an Anthropic API key', 'Keys start with "sk-ant-".');
      return;
    }
    await setAnthropicKey(k);
    setSavedKey(k);
    setKey('');
  }

  async function importFile() {
    const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
    if (picked.canceled) return;
    await run('Importing…', async () => {
      const s = await importShareFile(picked.result.uri);
      Alert.alert('Import complete', describeImport(s));
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: Spacing.md }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <Icon name="sparkles" color={t.primary} />
            <T kind="heading">Claude</T>
          </View>
          {savedKey ? (
            <>
              <View style={{ gap: 2 }}>
                <T kind="small">Credit available</T>
                {spending?.available != null ? (
                  <T style={{ fontSize: 22, fontWeight: '700' }}>
                    {formatUsd(spending.available)}
                    <T kind="secondary">
                      {'  '}({spending.avgPerRecipe != null ? `avg ${formatUsd(spending.avgPerRecipe)} per recipe` : 'no recipes cleaned up yet'})
                    </T>
                  </T>
                ) : (
                  <T kind="secondary">
                    Not set{spending?.avgPerRecipe != null ? ` (avg ${formatUsd(spending.avgPerRecipe)} per recipe)` : ''}
                  </T>
                )}
                <T kind="small">
                  {spending?.available != null && spending.balanceSetAt
                    ? `Estimated: the balance you entered on ${new Date(spending.balanceSetAt).toLocaleDateString()}, minus what this phone has spent since. Anthropic doesn't let apps read your balance, so update it when you add credit.`
                    : 'Enter your balance from console.anthropic.com (Billing) and the app will count down as Claude is used on this phone.'}
                </T>
              </View>
              <Button
                title={spending?.available != null ? 'Update balance' : 'Enter balance'}
                variant="secondary"
                icon="wallet-outline"
                onPress={() => setBalancePrompt(true)}
              />
              <Button
                title="Check balance at console.anthropic.com"
                variant="ghost"
                icon="open-outline"
                onPress={() => WebBrowser.openBrowserAsync('https://console.anthropic.com/settings/billing')}
              />
              <T kind="secondary">API key saved: sk-ant-…{savedKey.slice(-4)}</T>
              <Button
                title="Remove key"
                variant="secondary"
                onPress={async () => {
                  await setAnthropicKey(null);
                  setSavedKey(null);
                }}
              />
            </>
          ) : (
            <>
              <T kind="secondary">
                Claude scans, cleans up and finds recipes using your own Anthropic API key. You pay Anthropic per use; most recipes cost a few cents. The key stays in this device’s secure keychain.
              </T>
              <Field value={key} onChangeText={setKey} placeholder="sk-ant-…" autoCapitalize="none" autoCorrect={false} secureTextEntry />
              <Button title="Save key" onPress={saveKey} disabled={!key.trim()} />
              <Button title="Get a key at console.anthropic.com" variant="ghost" icon="open-outline" onPress={() => WebBrowser.openBrowserAsync('https://console.anthropic.com/settings/keys')} />
            </>
          )}
        </Card>

        <Card style={{ gap: Spacing.md }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <Icon name="cart" color={t.primary} />
            <T kind="heading">AnyList</T>
          </View>
          {anylist ? (
            <>
              <T kind="secondary">Connected as {anylist.email}. Tap any ingredient in a recipe to add it to one of your lists.</T>
              <Button
                title="Disconnect"
                variant="secondary"
                onPress={async () => {
                  await signOut();
                  invalidateListCache();
                }}
              />
            </>
          ) : (
            <>
              <T kind="secondary">Sign in with your AnyList account to send ingredients to your shopping lists.</T>
              <Field value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" />
              <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry textContentType="password" />
              <Button
                title="Connect AnyList"
                disabled={!email.trim() || !password}
                onPress={() =>
                  run('Signing in to AnyList…', async () => {
                    await signIn(email, password);
                    invalidateListCache();
                    setPassword('');
                  })
                }
              />
              <T kind="small">
                AnyList doesn’t offer an official API, so this uses the same private interface as AnyList’s web app. It may stop working if AnyList changes it. Your password is stored only in this device’s secure keychain.
              </T>
            </>
          )}
        </Card>

        <Card style={{ gap: Spacing.md }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <Icon name="people" color={t.primary} />
            <T kind="heading">Family sharing</T>
          </View>
          <T kind="secondary">
            Share a recipe from its page, or send your whole collection below. Family members with RecipeBox can open the file (or share it to RecipeBox) to import. Updated recipes replace older copies.
          </T>
          <Button
            title="Share all recipes"
            icon="share-outline"
            variant="secondary"
            onPress={() =>
              run('Preparing file…', async () => {
                const all = await listRecipes();
                if (!all.length) throw new Error('You don’t have any recipes yet.');
                const warnings = await shareRecipes(all);
                if (warnings.length) Alert.alert('Note', warnings.join('\n'));
              })
            }
          />
          <Button title="Import a recipe file" icon="download-outline" variant="secondary" onPress={importFile} />
        </Card>
      </ScrollView>
      <PromptModal
        visible={balancePrompt}
        title="Claude credit balance"
        message="Enter the remaining balance shown on console.anthropic.com under Billing."
        placeholder="e.g. 20.00"
        keyboardType="decimal-pad"
        submitLabel="Save"
        initialValue={spending?.available != null ? spending.available.toFixed(2) : ''}
        onCancel={() => setBalancePrompt(false)}
        onSubmit={(v) => {
          const amount = parseFloat(v.replace(/[$,\s]/g, ''));
          if (!Number.isFinite(amount) || amount < 0) {
            Alert.alert('Enter an amount like 20.00');
            return;
          }
          setBalancePrompt(false);
          setBalance(amount);
        }}
      />
      <BusyOverlay message={busy} />
    </KeyboardAvoidingView>
  );
}
