/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import React, { useEffect, useState, useReducer } from 'react';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Card, CardHeader, CardBody, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Gallery } from "@patternfly/react-core/dist/esm/layouts/Gallery/index.js";
import { Page, PageSection, } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { WithDialogs, useDialogs } from "dialogs.jsx";

import cockpit from 'cockpit';

const _ = cockpit.gettext;

const Monitor = ({firmwareVersion}) => {
    const [pv, setPv]     = useState("N/A");
    const [cv, setCv]     = useState("N/A");
    const [sv, setSv]     = useState("N/A");
    const [temp, setTemp] = useState("N/A");
    useEffect(() => {
        const script = `
while true
do
    echo "{\\"power_voltage\\": $(cat /sys/kernel/wp360-pmuc/power_voltage), \\"capacitor_voltage\\": $(cat /sys/kernel/wp360-pmuc/capacitor_voltage), \\"switching_voltage\\": $(cat /sys/kernel/wp360-pmuc/switching_voltage), \\"pmuc_temperature\\": $(cat /sys/kernel/wp360-pmuc/pmuc_temperature)}"
    sleep 1s
done
`
        const s = cockpit.script(script);
        s.stream(data_json => {
            try {
                const data = JSON.parse(data_json);
                setPv(data.power_voltage / 10);
                setCv(data.capacitor_voltage / 10);
                setSv(data.switching_voltage / 10);
                setTemp(data.pmuc_temperature /10);
            } catch (e) {
                // Sometimes, a re-render can be triggered while the script isn't sleeping; in that case, malformed json can happen.
                // This is perfectly fine to ignore, as it just means one update is skipped.
            }
        })
        .catch(console.log);
        return () => {s.close()};
    });
    return (
        <Card className="ct-card">
        <CardHeader>
        <CardTitle component="h2">UPS status</CardTitle>
        </CardHeader>
        <CardBody className="contains-list">
        <NumberInput name="firmware-version" className="" value={firmwareVersion} label="Firmware release" readOnly={true} />
        <NumberInput
            name="power-voltage"
            className="voltage"
            value={pv}
            label="Power supply"
            readOnly={true}
        />
        <NumberInput
            name="capacitor-voltage"
            className="voltage"
            value={cv}
            label="Capacitor/Battery"
            readOnly={true}
        /> 
        <NumberInput
            name="switching-voltage"
            className="voltage"
            value={sv}
            label="Regulator input"
            readOnly={true}
        />
        <NumberInput
            name="pmuc-temperature"
            className="temperature"
            value={temp}
            label="PMµc temperature"
            readOnly={true}
        />
        </CardBody>
        </Card>
    );
}


const PortPoweroff = () => {
    const [ports, setPorts] = useState([true, true, true, false]);
    const [activeHigh, setActiveHigh] = useState(false);
    useEffect( () => {
        const f = cockpit.file("/sys/kernel/wp360-pmuc/port_poweroff")
        const h = f.watch( p => {
            const byte = parseInt(p);
            console.log(`Read ports ${byte}`);
            setPorts([(byte & 1) > 0, (byte & 2) > 0, (byte & 4) > 0, (byte & 8) > 0]);
            setActiveHigh((byte & 0x80) > 0);
        });
        return () => {
            h.remove();
            f.close();
        }
    });

    const toggle = (n) => {
        return () => {
            const newPorts = ports.map((state, i) => {
                return (i === n) ? !state : state;
            });
            cockpit.spawn(["tee", "/sys/kernel/wp360-pmuc/port_poweroff"], {superuser: "require"})
            .input(((newPorts[0] ? 1 : 0) + (newPorts[1] ? 2 : 0) + (newPorts[2] ? 4 : 0) + (newPorts[3] ? 8 : 0) + (activeHigh ? 0x80 : 0)).toString());
        };
    };

    return (
        <Card className="ct-card">
        <CardHeader>
        <CardTitle component="h2">UPS-backed ports</CardTitle>
        </CardHeader>
        <CardBody>
        <input
            type="checkbox"
            checked={!ports[3]}
            id="usb3-poweroff"
            onChange={toggle(3)}
        /> <label htmlFor="usb3-poweroff">USB 3.0</label><br />
        <input
            type="checkbox"
            checked={!ports[2]}
            id="usb2-1-poweroff"
            onChange={toggle(2)}
        /> <label htmlFor="usb2-1-poweroff">USB 2.0 (1)</label><br />
        <input
            type="checkbox"
            checked={!ports[1]}
            id="usb2-2-poweroff"
            onChange={toggle(1)}
        /> <label htmlFor="usb2-2-poweroff">USB 2.0 (2)</label><br />
        <input
            type="checkbox"
            checked={!ports[0]}
            id="hdmi-poweroff"
            onChange={toggle(0)}
        /> <label htmlFor="hdmi-poweroff">HDMI</label><br />

        </CardBody>
        </Card>
    );
}

const NumberInput = ({ name, className, label, step = 0.1, min, max, defaultValues, readOnly, value, update, onChange }) => {
//    const [inValue, setInValue] = useState(value);
    return (
        <form 
            className={className + " number-row"}
            onSubmit={(e) => {
                e.preventDefault();
                const newValue = parseFloat((new FormData(e.target)).get(name));
                e.target.elements[0].blur();
//                setInValue(newValue);
                update(newValue);
            }}
        >
            {defaultValues && (
                <datalist id={name + "-list"}>
                    {defaultValues.map((i) => (<option key={i} value={i} />))}
                </datalist>
            )}
            <label htmlFor={name}>{label}</label>
            <span>
                {readOnly ? (
                    <span id={name}>{value}</span>
                ) : (
                    <input
                        type="number"
                        id={name}
                        name={name}
                        step={step}
                        min={min}
                        max={max}
                        list={name + "-list"}
//                        defaultValue={value}
                        value={value}
                        onChange={onChange}
                        onBlur={(e) => {
                            if (e.target.validity.valid) {
//                                setInValue(parseFloat(e.target.value));
                                update(parseFloat(e.target.value));
                            }
                        }}
                    />
                )}
            </span>
        </form>
    );
}

const Parameters = () => {
    const [values, setValues] = useState({power_voltage_nominal: 0, power_voltage_min: 0, capacitor_voltage_min: 0, battery_voltage_min: 0, switching_voltage_min: 0, switching_timeout: 0});
    const [tmpValues, setTmpValues] = useState({power_voltage_nominal: 0, power_voltage_min: 0, capacitor_voltage_min: 0, battery_voltage_min: 0, switching_voltage_min: 0, switching_timeout: 0});
    const parameters = [
        {type: "voltage", name: "power_voltage_nominal", label: "Nominal power supply",    min: 6,   max: 32,   factor: 10, defaultValues: [12, 24]},
        {type: "voltage", name: "power_voltage_min",     label: "Minimum input voltage",   min: 6,   max: 32,   factor: 10  },
        {type: "voltage", name: "capacitor_voltage_min", label: "Minimum capacitor level", min: 6,   max: 14,   factor: 10, defaultValues: [8.7, 12.8]},
        {type: "voltage", name: "battery_voltage_min",   label: "Minimum battery level",   min: 6,   max: 14,   factor: 10, defaultValues: [11.5]},
        {type: "voltage", name: "switching_voltage_min", label: "Regulator input cutoff",  min: 5.2, max: 32,   factor: 10  },
        {type: "timeout", name: "switching_timeout",     label: "Shutdown timeout",        min: 10,  max: 9999, factor: 10  },
    ];

    for (const param of parameters) {
        useEffect( () => {
            console.log("Using effect!");
            const file = cockpit.file(`/sys/kernel/wp360-pmuc/${param.name}`);
            const handle = file.watch(p => {
                const value = parseInt(p) / (param.factor || 1);
                console.log(`Read ${value} for ${param.name}`);
                if (value && (value !== values[param.name])) {
                    console.log(`Updating its value from ${values[param.name]}`);
                    let newValues = {...values};
                    newValues[param.name] = value;
                    let newTmpValues = {...tmpValues};
                    newTmpValues[param.name] = value;
                    setValues(newValues);
                    setTmpValues(newTmpValues);
                }
            });
            return () => {
                console.log("Cleaning up effect");
                handle.remove();
                file.close();
            }
        }, [values, setValues, tmpValues, setTmpValues]);
    }
    const update = (param) => {
        return (value) => {
            value *= (param.factor || 1);
            cockpit.spawn(["tee", `/sys/kernel/wp360-pmuc/${param.name}`], {superuser: "require"}).input(value.toString());
        };
    };
    const onChange = (param) => {
        return (e) => {
            let newTmpValues = {...tmpValues};
            newTmpValues[param.name] = e.target.value;
            setTmpValues(newTmpValues);
        };
    };
    const inputs = parameters.map(param => {
        const params = {update: update(param), onChange: onChange(param), key: param.name, value: tmpValues[param.name], ...param}
        return <NumberInput className={param.type} {...params} />;
    });
    return (
        <Card className="ct-card">
            <CardHeader>
                <CardTitle component="h2">Parameters</CardTitle>
            </CardHeader>
            <CardBody className="voltages">
                {inputs}
            </CardBody>
        </Card>
    );
}
 

const ProgramVersion = () => {
    const [version, setVersion] = useState(0);
    const [forced,  setForced]  = useState(false);
    const [code,    setCode]    = useState(0);
    const pv    = "program-version";
    const pv_no = "program-version-bypass";
    const pv_up = "program-version-ups";
    const pv_ba = "program-version-battery";
    const pv_wd = "program-version-watchdog";
    const pv_wd_force = "program-version-watchdog-force";
    const pv_wd_gentle = "program-version-watchdog-gentle";

    useEffect( () => {
        const f = cockpit.file("/sys/kernel/wp360-pmuc/program_version")
        f.watch( version => {
            const newCode = parseInt(version);
            setCode(newCode);
            setVersion(newCode & 0xF0);
            setForced((newCode & 0x01) ? true : false);
        });
        return () => f.close()
    });

    const updateVersion = ( version => {
        const newCode = version + (forced ? 1 : 0);
        cockpit.spawn(["tee", "/sys/kernel/wp360-pmuc/program_version"], {superuser: "require"})
        .input(newCode.toString())
        .then(console.log)
        .catch(console.log);
    });

    const updateForced = ( forced => {
        const newCode = version + (forced ? 1 : 0);
        cockpit.spawn(["tee", "/sys/kernel/wp360-pmuc/program_version"], {superuser: "require"})
        .input(newCode.toString());
    });

    const Radio = ({ name, value, check, change, id, label }) => {
        return (<li>
                <input 
                    type="radio" 
                    name={name}
                    value={value}
                    checked={check()}
                    onChange={change}
                    id={id}
                /><label htmlFor={id}>{label}</label>
            </li>
        );
    }
    const VersionRadio = (props) => {
        return (<Radio 
            check={() => version === props.value}
            change={() => updateVersion(props.value)}
            {...props}
        />);
    }
    const WatchdogRadio = (props) => {
        return (<Radio
            check={() => forced === props.value}
            change={() => updateForced(props.value)}
            {...props}
        />);
    }

    return (
        <Card className="ct-card">
        <CardHeader>
        <CardTitle component="h2">Power management</CardTitle>
        </CardHeader>
        <CardBody className="program-version">
        <h4>UPS behaviour</h4>
        <ul>
            <VersionRadio
                name={pv}
                value={0}
                id={pv_no}
                label="Bypass"
            />
            <VersionRadio
                name={pv}
                value={16}
                id={pv_up}
                label="Supercapacitor"
            /> 
            <VersionRadio
                name={pv}
                value={32}
                id={pv_ba}
                label="External battery"
            />
        </ul>
        <h4>Watchdog behaviour</h4>
        <ul>
            <WatchdogRadio
                name={pv_wd}
                value={false}
                id={pv_wd_gentle}
                label="Regular reboot"
            /> 
            <WatchdogRadio
                name={pv_wd}
                value={true}
                id={pv_wd_force}
                label="Forced reboot"
            />
        </ul>
        </CardBody>
        </Card>
    )
}

const Body = ({firmwareVersion}) => {
    return (
        <>
            <Monitor firmwareVersion={firmwareVersion}/>
            <ProgramVersion />
            <Parameters />
            <PortPoweroff />
        </>
    );
}

const Loading = () => {
    return (
        <Card>
            <CardHeader>
                <CardTitle component="h2">Loading...</CardTitle>
            </CardHeader>
            <CardBody>
            </CardBody>
        </Card>
    );
}

const Error = () => {
    return (
        <Card>
            <CardHeader>
                <CardTitle component="h2">Error</CardTitle>
            </CardHeader>
            <CardBody>
                <p>Something went wrong; power settings are unavailable, and the system might be abruptly shut down in case of a power outage. Reboot this device.</p>
            </CardBody>
        </Card>
    );
}

export const Application = () => {
    const [loaded, setLoaded] = useState(_("loading"));
    const [firmwareVersion, setFirmwareVersion] = useState("00-00-00");

    useEffect(() => {
        const pmuc_firmware = cockpit.file('/sys/kernel/wp360-pmuc/firmware_release');
        pmuc_firmware.read()
        .then(  (ver, tag) => {
            ver = ver.trim();
            console.log(`Read version ${ver} with tag ${tag}`);
            setLoaded( (!ver || (ver === "00-00-00")) ? "error" : "loaded" );
            if (ver !== firmwareVersion) {
                setFirmwareVersion(ver);
            }
        } )
        .catch( ver => setLoaded("error"));
        return pmuc_firmware.close;
    }, []);

    return (
        <WithDialogs>
        <Page className="pf-m-no-sidebar">
        <PageSection hasBodyWrapper={false} padding={{ default: "padding" }}>
        <Flex alignItems={{ default: 'alignItemsCenter' }}>
        <h2 className="pf-v6-u-font-size-3xl">WP360</h2>
        </Flex>
        </PageSection>
        <PageSection>
        <Gallery className='ct-system-overview' hasGutter>
        { (loaded === "loading") && (<Loading />) }
        { (loaded === "loaded" ) && (<Body firmwareVersion={firmwareVersion}/>) }
        { (loaded === "error"  ) && (<Error />) }
	    </Gallery>
        </PageSection>
        </Page>
        </WithDialogs>
    );
};
