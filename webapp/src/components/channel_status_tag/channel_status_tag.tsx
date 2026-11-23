// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Chip} from '@heroui/react/chip';
import {findStatusOption} from 'channel_status/statuses';
import {useChannelStatus} from 'channel_status/use_channel_status';
import YapUIProvider from 'heroui/yap_ui_provider';
import {useIntl} from 'react-intl';

import type {Channel} from '@mattermost/types/channels';

import './channel_status_tag.css';

type Props = {
    channel: Channel;
    onOpen: () => void;
};

// Rendered in the channel header; shows nothing until the channel has a status.
export default function ChannelStatusTag({channel, onOpen}: Props) {
    const intl = useIntl();
    const {status} = useChannelStatus(channel.id);
    const option = findStatusOption(status);
    if (!option) {
        return null;
    }

    const label = intl.formatMessage(option.message);
    return (
        <YapUIProvider className='StarterTemplate-ChannelStatusTag'>
            <button
                type='button'
                className='StarterTemplate-ChannelStatusTag__button'
                aria-label={intl.formatMessage({id: 'channel_status.tag_label', defaultMessage: 'Channel status: {status}'}, {status: label})}
                onClick={onOpen}
            >
                <Chip
                    color={option.color}
                    variant='soft'
                    size='sm'
                >
                    <span
                        className='StarterTemplate-ChannelStatusTag__dot'
                        aria-hidden='true'
                    />
                    <Chip.Label>{label}</Chip.Label>
                </Chip>
            </button>
        </YapUIProvider>
    );
}
