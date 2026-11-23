// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Alert} from '@heroui/react/alert';
import {Button} from '@heroui/react/button';
import {Chip} from '@heroui/react/chip';
import {Label} from '@heroui/react/label';
import {ListBox} from '@heroui/react/list-box';
import {Select} from '@heroui/react/select';
import {Spinner} from '@heroui/react/spinner';
import {statusReceived} from 'channel_status/state';
import {canEditChannelStatus, findStatusOption, STATUS_OPTIONS} from 'channel_status/statuses';
import {useChannelStatus} from 'channel_status/use_channel_status';
import {clearChannelStatus, setChannelStatus} from 'client';
import YapUIProvider from 'heroui/yap_ui_provider';
import {useId, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {Channel} from '@mattermost/types/channels';
import type {GlobalState} from '@mattermost/types/store';

import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';

import './channel_status_sidebar.css';

export default function ChannelStatusSidebar() {
    const channel = useSelector(getCurrentChannel);
    if (!channel) {
        return null;
    }

    // A new key per channel resets the form, so a save that finishes after the user
    // switches channels can't show its result in the wrong one.
    return (
        <YapUIProvider>
            <ChannelStatusPanel
                key={channel.id}
                channel={channel}
            />
        </YapUIProvider>
    );
}

function ChannelStatusPanel({channel}: {channel: Channel}) {
    const intl = useIntl();
    const dispatch = useDispatch();
    const headingId = useId();
    const {status, error, retry} = useChannelStatus(channel.id);
    const canEdit = useSelector((state: GlobalState) => canEditChannelStatus(state, channel));
    const [selected, setSelected] = useState<string>();
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string>();

    if (error) {
        return (
            <div className='StarterTemplate-ChannelStatusSidebar'>
                <Alert status='danger'>
                    <Alert.Indicator/>
                    <Alert.Content>
                        <Alert.Title>
                            <FormattedMessage
                                id='channel_status.load_error'
                                defaultMessage='Couldn’t load the channel status'
                            />
                        </Alert.Title>
                        <Alert.Description>{error}</Alert.Description>
                        <Button
                            className='StarterTemplate-ChannelStatusSidebar__retry'
                            variant='secondary'
                            size='sm'
                            onPress={retry}
                        >
                            <FormattedMessage
                                id='channel_status.retry'
                                defaultMessage='Try again'
                            />
                        </Button>
                    </Alert.Content>
                </Alert>
            </div>
        );
    }

    if (status === undefined) {
        return (
            <div className='StarterTemplate-ChannelStatusSidebar'>
                <p
                    className='StarterTemplate-ChannelStatusSidebar__text StarterTemplate-ChannelStatusSidebar__loading'
                    role='status'
                >
                    <Spinner
                        size='sm'
                        aria-hidden='true'
                    />
                    <FormattedMessage
                        id='channel_status.loading'
                        defaultMessage='Loading…'
                    />
                </p>
            </div>
        );
    }

    const current = findStatusOption(status);
    const save = (next: string) => {
        setSaving(true);
        setSaveError(undefined);
        (next ? setChannelStatus(channel.id, next) : clearChannelStatus(channel.id)).then(
            () => {
                dispatch(statusReceived(channel.id, next));
                setSelected(undefined);
                setSaving(false);
            },
            (err: Error) => {
                setSaveError(err.message);
                setSaving(false);
            },
        );
    };

    return (
        <div className='StarterTemplate-ChannelStatusSidebar'>
            <p className='StarterTemplate-ChannelStatusSidebar__text'>
                <FormattedMessage
                    id='channel_status.intro'
                    defaultMessage='Show everyone in {channel} how things are going. You can also use {command}.'
                    values={{
                        channel: channel.display_name,
                        command: (
                            <code
                                key='command'
                                className='StarterTemplate-ChannelStatusSidebar__command'
                            >
                                {'/channelstatus'}
                            </code>
                        ),
                    }}
                />
            </p>

            <section
                className='StarterTemplate-ChannelStatusSidebar__current'
                aria-labelledby={headingId}
                aria-live='polite'
            >
                <h3
                    id={headingId}
                    className='StarterTemplate-ChannelStatusSidebar__heading'
                >
                    <FormattedMessage
                        id='channel_status.current'
                        defaultMessage='Current status'
                    />
                </h3>
                {current ? (
                    <Chip
                        color={current.color}
                        variant='soft'
                    >
                        <span
                            className='StarterTemplate-ChannelStatusSidebar__dot'
                            aria-hidden='true'
                        />
                        <Chip.Label>{intl.formatMessage(current.message)}</Chip.Label>
                    </Chip>
                ) : (
                    <span className='StarterTemplate-ChannelStatusSidebar__text'>
                        <FormattedMessage
                            id='channel_status.none'
                            defaultMessage='No status set'
                        />
                    </span>
                )}
            </section>

            {canEdit ? (
                <div className='StarterTemplate-ChannelStatusSidebar__form'>
                    <Select
                        fullWidth={true}
                        placeholder={intl.formatMessage({id: 'channel_status.select_placeholder', defaultMessage: 'Choose a status'})}
                        value={selected ?? (status || null)}
                        onChange={(key) => setSelected(key === null ? undefined : String(key))}
                        isDisabled={saving}
                    >
                        <Label>
                            <FormattedMessage
                                id='channel_status.select_label'
                                defaultMessage='New status'
                            />
                        </Label>
                        <Select.Trigger>
                            <Select.Value/>
                            <Select.Indicator/>
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {STATUS_OPTIONS.map((option) => {
                                    const label = intl.formatMessage(option.message);
                                    return (
                                        <ListBox.Item
                                            key={option.value}
                                            id={option.value}
                                            textValue={label}
                                        >
                                            <span
                                                className={`StarterTemplate-ChannelStatusSidebar__dot StarterTemplate-ChannelStatusSidebar__dot--${option.value}`}
                                                aria-hidden='true'
                                            />
                                            {label}
                                            <ListBox.ItemIndicator/>
                                        </ListBox.Item>
                                    );
                                })}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                    <div className='StarterTemplate-ChannelStatusSidebar__actions'>
                        <Button
                            variant='primary'
                            size='sm'
                            isPending={saving}
                            isDisabled={!selected || selected === status}
                            onPress={() => selected && save(selected)}
                        >
                            {saving && (
                                <Spinner
                                    size='sm'
                                    color='current'
                                />
                            )}
                            <FormattedMessage
                                id='channel_status.save'
                                defaultMessage='Save'
                            />
                        </Button>
                        {current && (
                            <Button
                                variant='tertiary'
                                size='sm'
                                isDisabled={saving}
                                onPress={() => save('')}
                            >
                                <FormattedMessage
                                    id='channel_status.clear'
                                    defaultMessage='Clear status'
                                />
                            </Button>
                        )}
                    </div>
                    <div role='alert'>
                        {saveError && (
                            <Alert status='danger'>
                                <Alert.Indicator/>
                                <Alert.Content>
                                    <Alert.Title>
                                        <FormattedMessage
                                            id='channel_status.save_error'
                                            defaultMessage='Couldn’t update the status'
                                        />
                                    </Alert.Title>
                                    <Alert.Description>{saveError}</Alert.Description>
                                </Alert.Content>
                            </Alert>
                        )}
                    </div>
                </div>
            ) : (
                <p className='StarterTemplate-ChannelStatusSidebar__text'>
                    <FormattedMessage
                        id='channel_status.read_only'
                        defaultMessage='You don’t have permission to change this channel’s status.'
                    />
                </p>
            )}
        </div>
    );
}
