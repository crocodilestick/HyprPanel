import { bind, Variable, interval, AstalIO } from 'astal';
import AstalNetwork from 'gi://AstalNetwork?version=0.1';
import { NetworkService } from 'src/services/network';
import { Astal, Gtk } from 'astal/gtk3';
import Spinner from 'src/components/shared/Spinner';

const networkService = NetworkService.getInstance();
const astalNetwork = AstalNetwork.get_default();

export const AccessPoint = ({ connecting, accessPoint }: AccessPointProps): JSX.Element => {
    const derivedVars: Variable<unknown>[] = [];

    const isActiveVar = Variable.derive(
        [bind(astalNetwork.wifi, 'activeAccessPoint')],
        (activeAp) => accessPoint.ssid === activeAp?.ssid,
    );
    derivedVars.push(isActiveVar);

    const iconClassVar = Variable.derive([bind(isActiveVar)], (isActive) => {
        return `network-icon wifi ${isActive ? 'active' : ''} txt-icon`;
    });
    derivedVars.push(iconClassVar);

    const showStatusVar = Variable.derive(
        [bind(isActiveVar), bind(astalNetwork.wifi, 'state')],
        (isActive, state) => {
            return isActive && networkService.wifi.isApEnabled(state);
        },
    );
    derivedVars.push(showStatusVar);

    const wifiStatusVar = Variable.derive([bind(astalNetwork.wifi, 'state')], () => {
        return networkService.wifi.getWifiStatus();
    });
    derivedVars.push(wifiStatusVar);

    const showSpinnerVar = Variable.derive(
        [bind(connecting), bind(astalNetwork.wifi, 'activeAccessPoint'), bind(astalNetwork.wifi, 'state')],
        (conn, activeAp, state) => {
            const isConnecting = accessPoint.bssid === conn;
            const isActive = accessPoint.ssid === activeAp?.ssid;
            const isDisconnecting = isActive && state === AstalNetwork.DeviceState.DEACTIVATING;
            return isConnecting || isDisconnecting;
        },
    );
    derivedVars.push(showSpinnerVar);

    // Scrolling Logic
    const ssid = accessPoint.ssid ?? '';
    const scrollLimit = 20;
    const needsScrolling = ssid.length > scrollLimit;

    const labelText = Variable(needsScrolling ? ssid.substring(0, scrollLimit) + "..." : ssid);
    derivedVars.push(labelText);

    const isHovered = Variable(false);
    derivedVars.push(isHovered);

    let scrollInterval: AstalIO.Time | null = null;

    const startScrolling = () => {
        if (!needsScrolling) return;
        if (scrollInterval) return;

        let offset = 0;
        const padded = ssid + "     ";

        scrollInterval = interval(200, () => {
            offset++;
            if (offset >= padded.length) offset = 0;

            const end = offset + scrollLimit;
            let sub = padded.substring(offset, end);
            if (sub.length < scrollLimit) {
                sub += padded.substring(0, scrollLimit - sub.length);
            }
            labelText.set(sub);
        });
    };

    const stopScrolling = () => {
        if (scrollInterval) {
            scrollInterval.cancel();
            scrollInterval = null;
        }
        if (needsScrolling) {
            labelText.set(ssid.substring(0, scrollLimit) + "...");
        } else {
            labelText.set(ssid);
        }
    };

    const hoverSub = isHovered.subscribe((hovered) => {
        if (hovered) startScrolling();
        else stopScrolling();
    });

    const ConnectionIcon = (): JSX.Element => {
        return (
            <label
                valign={Gtk.Align.START}
                className={bind(iconClassVar)}
                label={networkService.getWifiIcon(accessPoint.iconName)}
            />
        );
    };

    const ConnectionAccessPoint = (): JSX.Element => {
        return (
            <box className="connection-container" valign={Gtk.Align.CENTER} vertical hexpand>
                <label
                    className="active-connection"
                    valign={Gtk.Align.CENTER}
                    halign={Gtk.Align.START}
                    label={bind(labelText)}
                    tooltipText={ssid}
                />
                <revealer revealChild={bind(showStatusVar)}>
                    <label
                        className="connection-status dim"
                        halign={Gtk.Align.START}
                        label={bind(wifiStatusVar)}
                    />
                </revealer>
            </box>
        );
    };

    let isDestroying = false;

    return (
        <button
            className="network-element-item"
            onHover={() => isHovered.set(true)}
            onHoverLost={() => isHovered.set(false)}
            onClick={(_: Astal.Button, event: Astal.ClickEvent) => {
                networkService.wifi.connectToAP(accessPoint, event);
            }}
            setup={(self) => {
                self.connect('unrealize', () => {
                    if (!isDestroying) {
                        isDestroying = true;
                        // Drop all derived Variables to prevent memory leaks
                        derivedVars.forEach((v) => v.drop());
                        hoverSub();
                        if (scrollInterval) scrollInterval.cancel();
                    }
                });
            }}
        >
            <box hexpand>
                <ConnectionIcon />
                <ConnectionAccessPoint />
                <revealer halign={Gtk.Align.END} valign={Gtk.Align.CENTER} revealChild={bind(showSpinnerVar)}>
                    <Spinner
                        className="spinner wap"
                        setup={(self: Gtk.Spinner) => {
                            self.start();
                        }}
                        halign={Gtk.Align.CENTER}
                        valign={Gtk.Align.CENTER}
                    />
                </revealer>
            </box>
        </button>
    );
};

interface AccessPointProps {
    connecting: Variable<string>;
    accessPoint: AstalNetwork.AccessPoint;
}
