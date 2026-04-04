import {
  defineWebApplication,
  ApplicationSetupOptions,
  Extension,
  AppMenuItemExtension,
  AppNavigationItem
} from '@opencloud-eu/web-pkg'
import { urlJoin } from '@opencloud-eu/web-client'
import '@opencloud-eu/extension-sdk/tailwind.css'
import { RouteRecordRaw } from 'vue-router'
import { computed } from 'vue'
import { useGettext } from 'vue3-gettext'

export default defineWebApplication({
  setup(args) {
    const { $gettext } = useGettext()

    const appInfo = {
      id: 'contacts-test',
      name: $gettext('Contacts'),
      icon: 'contacts-book',
      color: '#0063BE'
    }

    const routes: RouteRecordRaw[] = [
      {
        path: '/',
        redirect: { name: 'contacts-list' }
      },
      {
        path: '/list',
        name: 'contacts-list',
        component: () => import('./views/ContactsView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Contacts')
        }
      },
      {
        path: '/contact/:uid',
        name: 'contact-detail',
        component: () => import('./views/ContactDetailView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Contact')
        }
      }
    ]

    const extensions = ({ applicationConfig }: ApplicationSetupOptions) => {
      return computed<Extension[]>(() => {
        const menuItems: AppMenuItemExtension[] = [
          {
            id: `app.${appInfo.id}.menuItem`,
            type: 'appMenuItem',
            label: () => appInfo.name,
            color: appInfo.color,
            icon: appInfo.icon,
            path: urlJoin(appInfo.id, 'list')
          }
        ]
        return [...menuItems]
      })
    }

    const navItems: AppNavigationItem[] = [
      {
        name: () => $gettext('All contacts'),
        icon: 'contacts-book',
        route: { path: `/${appInfo.id}/list` },
        activeFor: [
          { name: 'contacts-list' },
          { name: 'contact-detail' }
        ]
      }
    ]

    return {
      appInfo,
      routes,
      navItems,
      extensions: extensions(args)
    }
  }
})
