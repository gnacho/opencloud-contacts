# Restricted deploy user

Deploys (the *Deploy Dev* workflow and `deploy.sh`) log in as `deploy-contacts`,
not `root`. The user's SSH keys are bound to a forced command,
[`contacts-deploy`](contacts-deploy), which accepts exactly two things:

- an rsync upload, confined by `rrsync -wo` to the app directory
  (no downloads, no paths outside it)
- `restart`, which runs [`contacts-restart`](contacts-restart) as `dockeruser`
  through a single sudoers rule

A leaked deploy key can therefore replace this app's files and restart
OpenCloud — but not open a shell, read data or touch anything else, including
other apps.

The same server also runs the Agenda app with its own `deploy` user. Each app
gets its own user because one `authorized_keys` file can bind a given key to
only one forced command — and your workstation key deploys both apps.

## Where each step runs

| Name used here | Machine | Role |
|---|---|---|
| **OpenCloud server** | `cloud.linux-nerds.org` | receives the deploy; the `deploy-contacts` user lives here. Commands run as root. |
| **Workstation** | your own computer with this repository | runs `deploy.sh`; holds the key `~/.ssh-jail/opencloud/hetzner_opencloud` |
| **Forgejo** | `forgejo.linux-nerds.org`, web UI only | stores the CI key as the secret `DEPLOY_SSH_KEY`; nothing to install there |

## 1. Check for rrsync — OpenCloud server

```sh
command -v rrsync
```

Already present if the Agenda deploy user is set up.

## 2. Create the user — OpenCloud server

```sh
useradd --system --create-home --shell /bin/sh deploy-contacts
usermod -p '*' deploy-contacts   # no password, but not "locked" — sshd refuses locked accounts without PAM
install -d -m 700 -o deploy-contacts -g deploy-contacts /home/deploy-contacts/.ssh
```

## 3. Install the scripts and the sudoers rule — OpenCloud server

```sh
cd /root
for f in contacts-deploy contacts-restart contacts-deploy.sudoers; do
  curl -fsSLO "https://forgejo.linux-nerds.org/frank/opencloud-contacts/raw/branch/main/deploy/server/$f"
done
```

Compare them with the copies on the **workstation** before installing:
`sha256sum deploy/server/contacts-deploy deploy/server/contacts-restart deploy/server/contacts-deploy.sudoers`
there must print the same sums as
`sha256sum contacts-deploy contacts-restart contacts-deploy.sudoers` on the server.

Then install:

```sh
install -m 755 -o root -g root contacts-deploy  /usr/local/bin/contacts-deploy
install -m 755 -o root -g root contacts-restart /usr/local/sbin/contacts-restart
install -m 440 -o root -g root contacts-deploy.sudoers /etc/sudoers.d/contacts-deploy
visudo -cf /etc/sudoers.d/contacts-deploy
rm contacts-deploy contacts-restart contacts-deploy.sudoers
```

The scripts must stay owned by root and not be writable by `deploy-contacts`.
If `visudo -cf` reports an error, delete `/etc/sudoers.d/contacts-deploy` at once.

## 4. Hand the app directory to the deploy user — OpenCloud server

```sh
APP_DIR=/mnt/HC_Volume_103940066/opencloud_keycloak_data/data/web/assets/apps/opencloud-contacts
mkdir -p "$APP_DIR"
chown -R deploy-contacts:deploy-contacts "$APP_DIR"
```

The files stay world-readable (rsync keeps the 644/755 modes from the build),
so the OpenCloud container reads them as before.

## 5. Keys

The OpenCloud server accepts a key for `deploy-contacts` only if its **public**
half is listed in `/home/deploy-contacts/.ssh/authorized_keys`, prefixed with
the forced command:

| Key | Private half lives in | Needed for |
|---|---|---|
| `forgejo-ci-contacts` (new) | Forgejo secret `DEPLOY_SSH_KEY` of this repository | the *Deploy Dev* workflow |
| `hetzner_opencloud` (existing) | workstation | `deploy.sh` — skip it if you only deploy through Forgejo |

Use a new CI key rather than Agenda's: each can then be revoked on its own.

**Workstation** — create the CI key:

```sh
ssh-keygen -t ed25519 -N '' -C forgejo-ci-contacts -f contacts-ci
```

**Forgejo** — in the *opencloud-contacts* repository, *Settings → Actions →
Secrets*: replace the value of `DEPLOY_SSH_KEY` with the full content of
`contacts-ci`, including the `-----BEGIN/END OPENSSH PRIVATE KEY-----` lines.
Then delete `contacts-ci` on the workstation.

**Workstation** — print the finished `authorized_keys` lines:

```sh
echo "command=\"/usr/local/bin/contacts-deploy\",restrict $(cat contacts-ci.pub)"
# only if deploy.sh should keep working:
echo "command=\"/usr/local/bin/contacts-deploy\",restrict $(ssh-keygen -y -f ~/.ssh-jail/opencloud/hetzner_opencloud) frank"
```

Each prints one long line of the form
`command="/usr/local/bin/contacts-deploy",restrict ssh-ed25519 <key> <comment>`.

**OpenCloud server** — put those lines, unchanged, into the file:

```sh
nano /home/deploy-contacts/.ssh/authorized_keys   # paste the line(s), save
chown deploy-contacts:deploy-contacts /home/deploy-contacts/.ssh/authorized_keys
chmod 600 /home/deploy-contacts/.ssh/authorized_keys
ssh-keygen -lf /home/deploy-contacts/.ssh/authorized_keys   # shows the fingerprints
```

## 6. Test

**Workstation** — only if you added the `hetzner_opencloud` line:

```sh
ssh -i ~/.ssh-jail/opencloud/hetzner_opencloud deploy-contacts@cloud.linux-nerds.org id
# → contacts-deploy: command not allowed: id

bash deploy.sh
# → builds, uploads, restarts
```

A password prompt instead means the key was not accepted — compare
`ssh-keygen -lf ~/.ssh-jail/opencloud/hetzner_opencloud` (workstation) with the
fingerprints from step 5.

**Forgejo** — run *Actions → Deploy Dev* once. It must upload and restart
without errors.

## 7. Remove the old root access — OpenCloud server

Only after the deploys worked: remove this repository's **old CI key** from
`/root/.ssh/authorized_keys` (`ssh-keygen -lf /root/.ssh/authorized_keys` lists
them). Leave `hetzner_opencloud` there — it is your own root access.
